import { randomUUID } from 'node:crypto';
import { DocumentReference, Firestore, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../shared/firestore/base-document';
import type { GymMember } from '../gym/members/member.entity';
import { allocatePayment, remainingOf, toKurus, toTl } from '../gym/ops/receivables.math';
import type { GymReceivable } from '../gym/ops/receivables.service';
import type { GymPackage } from '../gym/packages/package.entity';
import { applyPackage } from '../gym/shared/membership';
import { PaymentSession } from './payment-provider';

/** Sources whose successful card payment changes gym data (wallet, membership or a debt plan). */
export const GYM_SOURCES = ['gym_member_package', 'gym_wallet_topup', 'gym_receivable'] as const;
export type GymPaymentSource = (typeof GYM_SOURCES)[number];

export function isGymSource(source: string): source is GymPaymentSource {
  return (GYM_SOURCES as readonly string[]).includes(source);
}

export interface FulfillmentResult {
  /** Member whose membership changed (turnstile rights must be re-synced after commit). */
  renewedMember: GymMember | null;
}

/**
 * Applies one successful card payment inside the caller's transaction: all reads first, then the
 * writes. The caller only runs it while the session is not fulfilled yet and marks the session
 * fulfilled in the same transaction, so a repeated callback or reconcile cannot apply it twice.
 */
export async function fulfillGymPayment(
  db: Firestore,
  tx: Transaction,
  session: PaymentSession,
  providerPaymentId: string | null,
  now = new Date(),
): Promise<FulfillmentResult> {
  const col = (name: string) => db.collection(tenantCollectionPath(session.tenantId, name));
  const actor = 'system:payments';
  const at = now.toISOString();
  const amount = toTl(session.amountKurus);
  const userId = session.userId ?? '';
  const memberRef = col(TENANT_COLLECTION.gymMembers).doc(userId);
  const base = (ref: DocumentReference) => ({ ...createBaseFields(ref.id, actor, at), tenantId: session.tenantId });
  const income = (category: string, description: string, referenceId: string, referenceType: string) => {
    const ref = col(TENANT_COLLECTION.gymAccountingEntries).doc();
    tx.set(ref, {
      ...base(ref),
      type: 'income',
      amount,
      category,
      userId,
      description,
      referenceId,
      referenceType,
      paymentMethod: 'card',
      provider: session.provider,
      providerPaymentId,
      paymentSessionId: session.id,
      entryDate: at,
    });
  };
  const walletTx = (type: 'deposit', value: number, description: string, referenceId: string, referenceType: string, method: string) => {
    const ref = col(TENANT_COLLECTION.gymWalletTx).doc();
    tx.set(ref, {
      ...base(ref),
      userId,
      type,
      amount: value,
      description,
      referenceId,
      referenceType,
      status: 'completed',
      paymentMethod: method,
      paymentSessionId: session.id,
      notes: '',
    });
  };
  const notify = (title: string, body: string) => {
    const ref = col(TENANT_COLLECTION.gymMemberNotifications).doc();
    tx.set(ref, { ...base(ref), userId, type: 'online_payment', title, body, readAt: null });
  };

  // ── Reads ───────────────────────────────────────────────────────────────────────────────
  const memberSnap = await tx.get(memberRef);
  const member = memberSnap.exists ? (memberSnap.data() as GymMember) : null;
  if (!member || isDeleted(member)) {
    throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member of the payment was not found');
  }
  const pkgRef = session.source === 'gym_member_package' ? col(TENANT_COLLECTION.gymPackages).doc(session.sourceId) : null;
  const planRef = session.source === 'gym_receivable' ? col(TENANT_COLLECTION.gymReceivables).doc(session.sourceId) : null;
  const pkg = pkgRef ? ((await tx.get(pkgRef)).data() as GymPackage | undefined) : undefined;
  const plan = planRef ? ((await tx.get(planRef)).data() as GymReceivable | undefined) : undefined;

  // ── Writes ──────────────────────────────────────────────────────────────────────────────
  let wallet = toKurus(Number(member.walletBalance ?? 0));
  let renewed: GymMember | null = null;

  if (session.source === 'gym_wallet_topup') {
    wallet += session.amountKurus;
    walletTx('deposit', amount, 'Kartla bakiye yükleme', session.id, 'online_payment', 'card');
    income('wallet', 'Kartla bakiye yükleme', session.id, 'online_payment');
    notify('Bakiye yüklendi', `Cüzdanınıza ${amount} TL yüklendi.`);
  }

  if (session.source === 'gym_member_package') {
    if (!pkg || isDeleted(pkg)) {
      // Paid for a package that disappeared meanwhile: keep the money on the wallet.
      wallet += session.amountKurus;
      walletTx('deposit', amount, 'Paket bulunamadı, ödeme cüzdana eklendi', session.id, 'online_payment', 'card');
      income('wallet', 'Kartla ödeme (paket bulunamadı)', session.id, 'online_payment');
      notify('Ödemeniz cüzdana eklendi', `Seçtiğiniz paket artık satışta olmadığı için ${amount} TL cüzdanınıza eklendi.`);
    } else {
      renewed = applyPackage(member, pkg, amount, now);
      tx.update(memberRef, {
        membershipStatus: renewed.membershipStatus,
        packageLabel: renewed.packageLabel,
        packagePrice: renewed.packagePrice,
        membershipStartsAt: renewed.membershipStartsAt,
        membershipEndsAt: renewed.membershipEndsAt,
        classCreditsTotal: renewed.classCreditsTotal ?? null,
        classCreditsUsed: renewed.classCreditsUsed ?? 0,
        updatedAt: at,
        updatedBy: actor,
      });
      income('membership', `${pkg.name} (kartla)`, pkg.id, 'membership');
      notify('Paketiniz tanımlandı', `${pkg.name} kartla ödendi ve üyeliğinize tanımlandı.`);
    }
  }

  if (session.source === 'gym_receivable') {
    if (!plan || isDeleted(plan)) {
      throw new AppException(ErrorCode.GYM_RECEIVABLE_NOT_FOUND, 'Receivable of the payment was not found');
    }
    // Pays the open installments; anything above the remaining debt (e.g. a plan settled at the
    // desk meanwhile) goes to the member's wallet instead of being lost.
    const open = plan.status === 'open' ? toKurus(remainingOf(plan.installments)) : 0;
    const applied = Math.min(open, session.amountKurus);
    const excess = session.amountKurus - applied;
    if (applied > 0) {
      const installments = allocatePayment(plan.installments, toTl(applied), at);
      const remaining = remainingOf(installments);
      tx.update(planRef!, {
        installments,
        payments: [
          ...(plan.payments ?? []),
          { id: randomUUID(), kind: 'installment', amount: toTl(applied), paymentMethod: 'card', paidAt: at, recordedBy: actor, note: `iyzico ${providerPaymentId ?? session.id}` },
        ],
        paidAmount: toTl(toKurus(plan.paidAmount) + applied),
        remainingAmount: remaining,
        status: toKurus(remaining) === 0 ? 'paid' : 'open',
        updatedAt: at,
        updatedBy: actor,
      });
      income('installment', `${plan.packageName} taksit tahsilatı (kartla)`, plan.id, 'receivable');
      if (plan.walletLinked) {
        // The debt was carried as a negative wallet balance; paying it lifts the wallet back.
        wallet += applied;
        walletTx('deposit', toTl(applied), `${plan.packageName} borç ödemesi`, plan.id, 'receivable', 'receivable');
      }
    }
    if (excess > 0) {
      wallet += excess;
      walletTx('deposit', toTl(excess), 'Fazla ödeme cüzdana eklendi', session.id, 'online_payment', 'card');
    }
    notify('Ödemeniz alındı', `${plan.packageName} için ${amount} TL ödemeniz alındı.`);
  }

  if (wallet !== toKurus(Number(member.walletBalance ?? 0))) {
    tx.update(memberRef, { walletBalance: toTl(wallet), updatedAt: at, updatedBy: actor });
  }
  return { renewedMember: renewed };
}

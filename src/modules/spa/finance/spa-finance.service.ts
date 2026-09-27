import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import { summarizeCashDay } from '../shared/cash-summary';
import { assertCashDayOpen } from '../shared/cash-day';
import { spaInvalid, spaNotFound, spaPrecondition } from '../shared/spa-errors';
import { isDateId, PaymentLine, round2 } from '../shared/spa-money';
import { SpaDoc, SpaStore } from '../shared/spa-store';
import { dayBoundsInTz } from '../shared/spa-time';
import {
  CreateSpaCommissionRuleDto,
  CreateSpaPaymentDto,
  PayoutCommissionsDto,
  UpdateSpaCommissionRuleDto,
} from './finance.dto';

const RULE_NOT_FOUND = 'Prim kuralı bulunamadı.';

@Injectable()
export class SpaFinanceService {
  constructor(private readonly store: SpaStore) {}

  // ---- Payments ----

  /** Manual (non-session) payment, blocked while today's cash register day is closed. */
  async createPayment(dto: CreateSpaPaymentDto) {
    const timeZone = await this.store.timeZone();
    const userId = this.store.userId();
    const paymentRef = this.store.collection(TENANT_COLLECTION.spaPayments).doc();

    const payment = await this.store.runTransaction(async (tx) => {
      await assertCashDayOpen(tx, this.store, timeZone);
      if (dto.customerId) {
        const customer = await tx.get(
          this.store.doc(TENANT_COLLECTION.spaCustomers, dto.customerId),
        );
        if (!customer.exists) throw spaNotFound('Müşteri bulunamadı.');
      }
      const item = {
        ...createBaseFields(paymentRef.id, userId),
        customerId: dto.customerId || null,
        method: dto.method,
        amount: dto.amount,
        note: dto.note?.trim() || null,
        isRefund: false,
      };
      tx.set(paymentRef, item);
      return item;
    });

    await this.store.audit('payments', 'callable', paymentRef.id, null, {
      method: dto.method,
      amount: dto.amount,
      customerId: dto.customerId || null,
    });
    return payment;
  }

  /** Creates a reversing negative entry — the original payment is never edited or deleted. */
  async refundPayment(paymentId: string, reason?: string) {
    const timeZone = await this.store.timeZone();
    const userId = this.store.userId();
    const originalRef = this.store.doc(TENANT_COLLECTION.spaPayments, paymentId);
    const refundRef = this.store.collection(TENANT_COLLECTION.spaPayments).doc();

    const original = await this.store.runTransaction(async (tx) => {
      await assertCashDayOpen(tx, this.store, timeZone);
      const snapshot = await tx.get(originalRef);
      if (!snapshot.exists) throw spaNotFound('Ödeme kaydı bulunamadı.');
      const data = snapshot.data() as SpaDoc;
      if (data['isRefund']) throw spaPrecondition('Bir iade kaydı tekrar iade edilemez.');
      if (data['refundId']) throw spaPrecondition('Bu ödeme zaten iade edilmiş.');

      const now = new Date().toISOString();
      tx.set(refundRef, {
        ...createBaseFields(refundRef.id, userId, now),
        customerId: data['customerId'] ?? null,
        method: data['method'],
        amount: -Math.abs(Number(data['amount'])),
        note: reason?.trim() || 'İade',
        isRefund: true,
        originalPaymentId: paymentId,
      });
      tx.update(originalRef, { refundId: refundRef.id, updatedAt: now, updatedBy: userId });
      return data;
    });

    await this.store.audit(
      'payments',
      'callable',
      refundRef.id,
      { paymentId, amount: original['amount'] },
      { amount: -Math.abs(Number(original['amount'])) },
    );
    return { refundId: refundRef.id };
  }

  // ---- Cash register ----

  listCashDays(from?: string, to?: string) {
    return this.store.list(TENANT_COLLECTION.spaCashRegisterDays, {
      dateField: 'date',
      from,
      // `to` is inclusive for day ids; the store treats it as exclusive, so move it one char past.
      to: to ? `${to}~` : undefined,
      orderBy: { field: 'date', dir: 'asc' },
    });
  }

  async getCashDay(date: string) {
    assertDateId(date);
    return (
      (await this.store.find(TENANT_COLLECTION.spaCashRegisterDays, date)) ?? {
        id: date,
        date,
        status: 'open',
      }
    );
  }

  /** Snapshots the day's totals into `spaCashRegisterDays/{date}` atomically with the status check. */
  async closeCashDay(date: string) {
    assertDateId(date);
    const timeZone = await this.store.timeZone();
    const { start, end } = dayBoundsInTz(date, timeZone);
    const from = start.toISOString();
    const to = end.toISOString();
    const dayRef = this.store.doc(TENANT_COLLECTION.spaCashRegisterDays, date);
    const userId = this.store.userId();
    const inWindow = (name: string, field: string) =>
      this.store.collection(name).where(field, '>=', from).where(field, '<', to);

    const summary = await this.store.runTransaction(async (tx) => {
      const daySnap = await tx.get(dayRef);
      if (daySnap.exists && daySnap.data()?.['status'] === 'closed') {
        throw spaPrecondition('Bu gün zaten kapatılmış.');
      }
      const [sessions, payments, expenses, accruals] = await Promise.all([
        tx.get(inWindow(TENANT_COLLECTION.spaSessions, 'createdAt')),
        tx.get(inWindow(TENANT_COLLECTION.spaPayments, 'createdAt')),
        tx.get(inWindow(TENANT_COLLECTION.spaExpenses, 'date')),
        tx.get(inWindow(TENANT_COLLECTION.spaCommissionAccruals, 'date')),
      ]);
      const rows = <T>(snapshot: { docs: { data(): unknown }[] }) =>
        snapshot.docs
          .map((doc) => doc.data() as SpaDoc)
          .filter((row) => !isDeleted(row)) as unknown as T[];

      const totals = summarizeCashDay({
        sessions: rows<{ payments?: PaymentLine[] }>(sessions),
        payments: rows<PaymentLine>(payments),
        expenses: rows<{ amount: number }>(expenses),
        accruals: rows<{ amount: number }>(accruals),
      });
      const now = new Date().toISOString();
      const previous = daySnap.exists ? (daySnap.data() as SpaDoc) : null;
      tx.set(dayRef, {
        ...(previous ?? createBaseFields(date, userId, now)),
        id: date,
        date,
        status: 'closed',
        ...totals,
        closedAt: now,
        closedBy: userId,
        reopenHistory: previous?.['reopenHistory'] ?? [],
        updatedAt: now,
        updatedBy: userId,
      });
      return totals;
    });

    await this.store.audit('cashRegisterDays', 'callable', date, null, {
      netCash: summary.netCash,
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
    });
    return { date, ...summary };
  }

  /** Reopens a closed day for correction; the prior close is kept in `reopenHistory`. */
  async reopenCashDay(date: string, reason?: string) {
    assertDateId(date);
    const dayRef = this.store.doc(TENANT_COLLECTION.spaCashRegisterDays, date);
    const userId = this.store.userId();
    await this.store.runTransaction(async (tx) => {
      const snapshot = await tx.get(dayRef);
      const day = snapshot.exists ? (snapshot.data() as SpaDoc) : null;
      if (!day || day['status'] !== 'closed') throw spaPrecondition('Bu gün kapalı değil.');
      const now = new Date().toISOString();
      const history = Array.isArray(day['reopenHistory']) ? day['reopenHistory'] : [];
      tx.update(dayRef, {
        status: 'open',
        reopenHistory: [...history, { at: now, by: userId, reason: reason?.trim() || null }],
        updatedAt: now,
        updatedBy: userId,
      });
    });
    await this.store.audit('cashRegisterDays', 'callable', date, null, {
      status: 'open',
      reason: reason ?? null,
    });
    return { success: true };
  }

  // ---- Commissions ----

  listRules() {
    return this.store.list(TENANT_COLLECTION.spaCommissionRules, {
      orderBy: { field: 'priority', dir: 'asc' },
    });
  }

  createRule(dto: CreateSpaCommissionRuleDto) {
    assertRuleValue(dto.type, dto.value);
    return this.store.create(TENANT_COLLECTION.spaCommissionRules, 'commissionRules', {
      ...dto,
      active: dto.active ?? true,
    });
  }

  async updateRule(id: string, dto: UpdateSpaCommissionRuleDto) {
    const current = await this.store.getOrThrow(
      TENANT_COLLECTION.spaCommissionRules,
      id,
      RULE_NOT_FOUND,
    );
    assertRuleValue(dto.type ?? String(current['type']), dto.value ?? Number(current['value']));
    return this.store.update(
      TENANT_COLLECTION.spaCommissionRules,
      'commissionRules',
      id,
      dto,
      RULE_NOT_FOUND,
    );
  }

  removeRule(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.spaCommissionRules,
      'commissionRules',
      id,
      RULE_NOT_FOUND,
    );
  }

  listAccruals(query: {
    from?: string;
    to?: string;
    staffId?: string;
    status?: string;
    limit?: number;
  }) {
    return this.store.list(TENANT_COLLECTION.spaCommissionAccruals, {
      dateField: 'date',
      from: query.from,
      to: query.to,
      equals: { staffId: query.staffId, status: query.status },
      orderBy: { field: 'date', dir: 'desc' },
      limit: query.limit,
    });
  }

  /** Marks pending accruals as paid and writes one `prim` expense for the total. */
  async payout(dto: PayoutCommissionsDto) {
    const accrualIds = [...new Set(dto.accrualIds)];
    const userId = this.store.userId();
    const result = await this.store.runTransaction(async (tx) => {
      const refs = accrualIds.map((id) =>
        this.store.doc(TENANT_COLLECTION.spaCommissionAccruals, id),
      );
      const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
      let total = 0;
      for (const snapshot of snapshots) {
        if (!snapshot.exists) throw spaNotFound('Tahakkuk kaydı bulunamadı.');
        const accrual = snapshot.data() as SpaDoc;
        if (accrual['staffId'] !== dto.staffId)
          throw spaPrecondition('Tahakkuk bu personele ait değil.');
        if (accrual['status'] !== 'pending')
          throw spaPrecondition('Sadece bekleyen tahakkuklar ödenebilir.');
        total += Number(accrual['amount']);
      }
      const totalAmount = round2(total);
      const now = new Date().toISOString();
      const expenseRef = this.store.collection(TENANT_COLLECTION.spaExpenses).doc();
      const payoutRef = this.store.collection(TENANT_COLLECTION.spaCommissionPayouts).doc();
      tx.set(expenseRef, {
        ...createBaseFields(expenseRef.id, userId, now),
        kategori: 'prim',
        amount: totalAmount,
        staffId: dto.staffId,
        note: `Prim ödemesi (${accrualIds.length} tahakkuk)`,
        date: now,
      });
      tx.set(payoutRef, {
        ...createBaseFields(payoutRef.id, userId, now),
        staffId: dto.staffId,
        accrualIds,
        totalAmount,
        expenseId: expenseRef.id,
      });
      refs.forEach((ref) =>
        tx.update(ref, {
          status: 'paid',
          payoutId: payoutRef.id,
          updatedAt: now,
          updatedBy: userId,
        }),
      );
      return { payoutId: payoutRef.id, expenseId: expenseRef.id, totalAmount };
    });

    await this.store.audit('commissionPayouts', 'callable', result.payoutId, null, {
      staffId: dto.staffId,
      totalAmount: result.totalAmount,
      accrualCount: accrualIds.length,
    });
    return result;
  }
}

function assertDateId(date: string) {
  if (!isDateId(date)) throw spaInvalid('date (YYYY-MM-DD) zorunludur.');
}

function assertRuleValue(type: string, value: number) {
  if (type === 'percent' && value > 100) throw spaInvalid('Yüzde oranı 100’ü aşamaz.');
}

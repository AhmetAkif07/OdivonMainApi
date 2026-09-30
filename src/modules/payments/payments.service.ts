import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { IyzicoProvider } from './iyzico.provider';
import { CreateCheckoutDto } from './payments.dto';
import { CheckoutInput, PaymentProvider, PaymentProviderId, PaymentSession, PaymentSource } from './payment-provider';

@Injectable()
export class PaymentsService {
  private readonly providers: Map<PaymentProviderId, PaymentProvider>;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
    iyzico: IyzicoProvider,
  ) {
    this.providers = new Map([[iyzico.id, iyzico]]);
  }

  private settings(tenantId: string) {
    return this.firebase.db.doc(`tenants/${tenantId}/paymentSettings/default`);
  }

  private sessions() {
    return this.firebase.db.collection('paymentSessions');
  }

  async getProviders() {
    return {
      available: [...this.providers.keys()].map((id) => ({ id, mode: 'sandbox' as const,
        configured: id !== 'iyzico' || Boolean(process.env.IYZICO_SANDBOX_API_KEY && process.env.IYZICO_SANDBOX_SECRET_KEY) })),
      selected: await this.getSelected(),
    };
  }

  async getSelected(): Promise<'iyzico' | 'none'> {
    const snapshot = await this.settings(this.tenant.getTenantId()).get();
    const selected = snapshot.data()?.provider;
    return selected === 'iyzico' ? 'iyzico' : 'none';
  }

  async select(provider: 'iyzico' | 'none') {
    if (provider !== 'none' && !this.providers.has(provider)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Payment provider is not available');
    }
    await this.settings(this.tenant.getTenantId()).set({ provider, mode: 'sandbox', updatedAt: new Date().toISOString(),
      updatedBy: this.tenant.getUserId() });
    return { provider, mode: 'sandbox' };
  }

  async createCheckout(dto: CreateCheckoutDto, ip: string) {
    const tenantId = this.tenant.getTenantId();
    const selected = await this.getSelected();
    if (selected === 'none') throw new AppException(ErrorCode.INVALID_STATUS, 'Choose a payment provider first');
    const provider = this.providers.get(selected)!;
    const { amountKurus, buyerId } = await this.resolveSource(tenantId, dto.source, dto.sourceId);
    const now = new Date().toISOString();
    const id = randomUUID();
    const session: PaymentSession = {
      id, tenantId, provider: selected, source: dto.source, sourceId: dto.sourceId,
      amountKurus, currency: 'TRY', status: 'initializing', token: null, paymentPageUrl: null,
      providerPaymentId: null, createdBy: this.tenant.getUserId(), createdAt: now, updatedAt: now,
    };
    const ref = this.sessions().doc(id);
    const lock = this.firebase.db.doc(`tenants/${tenantId}/paymentReservations/${dto.source}_${dto.sourceId}`);
    let existingId: string | null = null;
    await this.firebase.db.runTransaction(async (tx) => {
      existingId = null;
      const current = await tx.get(lock);
      const data = current.data();
      if (data?.sessionId && data.status !== 'failed') {
        existingId = String(data.sessionId);
        return;
      }
      tx.set(lock, { sessionId: id, status: 'initializing', createdAt: now });
      tx.set(ref, session);
    });
    if (existingId) {
      const existing = await this.getSessionForTenant(existingId);
      if (existing.status === 'pending' && existing.paymentPageUrl && existing.amountKurus === amountKurus) {
        return this.publicCheckout(existing);
      }
      throw new AppException(ErrorCode.INVALID_STATUS, 'A checkout for this record is already being processed');
    }
    const input: CheckoutInput = {
      id, amountKurus, source: dto.source, sourceId: dto.sourceId,
      callbackUrl: `${process.env.PAYMENT_PUBLIC_BASE_URL ?? 'https://mainapi.odivon.com'}/api/v1/payments/callback/iyzico/${id}`,
      buyer: { id: buyerId, name: dto.name, surname: dto.surname, identityNumber: dto.identityNumber,
        email: dto.email, gsmNumber: dto.gsmNumber, address: dto.address, city: dto.city,
        country: dto.country, ip },
    };
    try {
      const checkout = await provider.createCheckout(input);
      await this.firebase.db.runTransaction(async (tx) => {
        tx.update(ref, { token: checkout.token, paymentPageUrl: checkout.paymentPageUrl,
          status: 'pending', updatedAt: new Date().toISOString() });
        tx.update(lock, { status: 'pending' });
      });
      return this.publicCheckout({ ...session, ...checkout, status: 'pending' });
    } catch (error) {
      await this.firebase.db.runTransaction(async (tx) => {
        tx.update(ref, { status: 'failed', updatedAt: new Date().toISOString() });
        tx.update(lock, { status: 'failed' });
      });
      throw error;
    }
  }

  async get(id: string) {
    return this.publicSession(await this.getSessionForTenant(id));
  }

  async reconcile(id: string) {
    const session = await this.getSessionForTenant(id);
    if (!session.token) throw new AppException(ErrorCode.INVALID_STATUS, 'Checkout has no token yet');
    await this.handleCallback(id, session.token);
    return this.get(id);
  }

  async handleCallback(id: string, token: string) {
    const ref = this.sessions().doc(id);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new AppException(ErrorCode.INVALID_STATUS, 'Unknown checkout');
    const session = snapshot.data() as PaymentSession;
    if (!session.token || session.token !== token || session.provider !== 'iyzico') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Invalid checkout token');
    }
    if (session.status === 'succeeded' || session.status === 'failed') return { status: session.status };
    const provider = this.providers.get(session.provider)!;
    const verified = await provider.verifyCheckout(token, { id, amountKurus: session.amountKurus });
    await this.firebase.db.runTransaction(async (tx) => {
      const lock = this.firebase.db.doc(`tenants/${session.tenantId}/paymentReservations/${session.source}_${session.sourceId}`);
      const [latest, reservation] = await Promise.all([tx.get(ref), tx.get(lock)]);
      const current = latest.data() as PaymentSession;
      if (current.token !== token || current.status !== 'pending') return;
      tx.update(ref, { status: verified.status, providerPaymentId: verified.providerPaymentId,
        updatedAt: new Date().toISOString() });
      if (reservation.data()?.sessionId === id) tx.update(lock, { status: verified.status });
    });
    return { status: verified.status };
  }

  private async getSessionForTenant(id: string): Promise<PaymentSession> {
    const snapshot = await this.sessions().doc(id).get();
    const session = snapshot.data() as PaymentSession | undefined;
    if (!session || session.tenantId !== this.tenant.getTenantId()) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Payment session was not found');
    }
    return session;
  }

  private publicSession(session: PaymentSession) {
    const { token: _token, tenantId: _tenantId, ...publicRecord } = session;
    return publicRecord;
  }

  private publicCheckout(session: PaymentSession) {
    return this.publicSession(session);
  }

  private async resolveSource(tenantId: string, source: PaymentSource, id: string): Promise<{ amountKurus: number; buyerId: string }> {
    const collection = source === 'vet_sale' ? TENANT_COLLECTION.sales : TENANT_COLLECTION.gymReceivables;
    const snapshot = await this.firebase.db.doc(`${tenantCollectionPath(tenantId, collection)}/${id}`).get();
    const data = snapshot.data();
    if (!data || data.deletedAt) throw new AppException(ErrorCode.INVALID_STATUS, 'Payment source was not found');
    if (source === 'vet_sale' && (data.type !== 'sale' || !data.customerId)) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Only customer sales can be paid');
    }
    if (source === 'gym_receivable' && data.status !== 'open') {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Gym receivable is not open');
    }
    let amount = source === 'vet_sale' ? Number(data.total) : Number(data.remainingAmount);
    if (source === 'vet_sale') {
      const paid = await this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.collections))
        .where('saleId', '==', id).get();
      for (const row of paid.docs) {
        const collection = row.data();
        if (!collection.deletedAt && collection.kind === 'collection') amount -= Number(collection.amount ?? 0);
      }
    }
    const amountKurus = Math.round(amount * 100);
    if (!Number.isFinite(amountKurus) || amountKurus <= 0) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'No positive outstanding amount');
    }
    return { amountKurus, buyerId: String(source === 'vet_sale' ? data.customerId : data.userId) };
  }
}

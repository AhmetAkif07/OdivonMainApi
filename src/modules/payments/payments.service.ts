import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { isDeleted } from '../../shared/firestore/base-document';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { AccessSyncService } from '../gym/access/access-sync.service';
import type { GymMember } from '../gym/members/member.entity';
import type { GymPackage } from '../gym/packages/package.entity';
import { fulfillGymPayment, isGymSource } from './gym-fulfillment';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { IyzicoProvider } from './iyzico.provider';
import { CreateCheckoutDto, CreateSaasOrderDto, MemberCheckoutDto } from './payments.dto';
import { CheckoutInput, IyzicoCredentials, PaymentProvider, PaymentProviderId, PaymentSession, PaymentSource } from './payment-provider';
import { nextPeriod, receiptNo, SaasCycle } from './saas-billing';
import { SAAS_PLAN_MODULE } from './saas-prices';
import { pricingProduct, SaasPlanPricing, SaasPricingService, STATIC_SAAS_PRICING } from '../saas-pricing/saas-pricing.service';

/** iyzico checkout form tokens live ~30 minutes; an older pending session is treated as abandoned. */
export const CHECKOUT_TTL_MS = 30 * 60_000;
export const WALLET_TOPUP_MIN_KURUS = 50_00;
export const WALLET_TOPUP_MAX_KURUS = 20_000_00;

const DEFAULT_RETURN_ORIGINS = [
  'https://odivon-main-api-a2095.web.app',
  'https://odivon-main-api-a2095.firebaseapp.com',
  'https://odivon-gym-client.dogangns-98.workers.dev',
  'https://odivon-panel.dogangns-98.workers.dev',
  'https://odivonapm.dogangns-98.workers.dev',
  'https://rent.odivon.com',
  'http://localhost:4200',
];

interface Buyer {
  name: string;
  surname: string;
  identityNumber: string;
  email: string;
  gsmNumber: string;
  address: string;
  city: string;
  country: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly providers: Map<PaymentProviderId, PaymentProvider>;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
    iyzico: IyzicoProvider,
    @Optional() private readonly gymCredentials?: GymPaymentCredentialsService,
    @Optional() private readonly accessSync?: AccessSyncService,
    @Optional() private readonly pricing: SaasPricingService = STATIC_SAAS_PRICING,
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
      available: [...this.providers.values()].map((provider) => ({
        id: provider.id,
        mode: provider.mode(),
        configured: provider.configured(),
      })),
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
    const mode = provider === 'none' ? null : this.providers.get(provider)!.mode();
    await this.settings(this.tenant.getTenantId()).set({ provider, mode, updatedAt: new Date().toISOString(),
      updatedBy: this.tenant.getUserId() });
    return { provider, mode };
  }

  /** Plans this tenant can buy: an APM-only tenant sees the APM packages, everyone else the shared set. */
  async saasPlans() {
    const plans = await this.saasPlanCatalog();
    return Object.fromEntries(
      plans.map((plan) => [
        plan.id,
        { ...(plan.monthly !== null ? { monthly: plan.monthly } : {}), ...(plan.yearly !== null ? { yearly: plan.yearly } : {}) },
      ]),
    );
  }

  /** Same plans with names, at this tenant's product prices, for apps that render a pricing table. */
  async saasPlanCatalog(): Promise<SaasPlanPricing[]> {
    const modules = this.tenant.getStore().modules ?? [];
    const result: SaasPlanPricing[] = [];
    for (const plan of await this.pricing.activePlans()) {
      if (!this.planAvailable(plan.id)) continue;
      const priced = (await this.pricing.activePlans(pricingProduct(modules, plan.id))).find((item) => item.id === plan.id);
      if (priced) result.push(priced);
    }
    return result;
  }

  private planAvailable(planId: string): boolean {
    const planModule = SAAS_PLAN_MODULE[planId];
    const tenantModules = this.tenant.getStore().modules ?? [];
    const isApmOnly = tenantModules.length > 0 && tenantModules.every((module) => module === 'apm');
    return planModule ? tenantModules.includes(planModule) : !isApmOnly;
  }

  /** Member panel: whether "pay by card" is offered (the gym has its own keys switched on). */
  async memberCardAvailability() {
    return { card: (await this.gymCredentials?.isAvailable()) ?? false };
  }

  async createSaasOrder(dto: CreateSaasOrderDto) {
    if (this.tenant.getStore().role !== 'owner') {
      throw new AppException(ErrorCode.FORBIDDEN_ROLE, 'Only the tenant owner can create a SaaS order');
    }
    // A module's own packages (APM) are only sold to tenants of that module, and vice versa.
    if ((await this.pricing.price(dto.planId, dto.billingCycle)) && !this.planAvailable(dto.planId)) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'This plan is not available for this product');
    }
    // The tenant's product price: a product can have its own price or not sell the plan at all.
    const amount = await this.pricing.price(dto.planId, dto.billingCycle, pricingProduct(this.tenant.getStore().modules, dto.planId));
    if (!amount) throw new AppException(ErrorCode.FINANCE_INVALID, 'Invalid SaaS plan or billing cycle');
    const tenantId = this.tenant.getTenantId();
    const id = randomUUID();
    const now = new Date().toISOString();
    const amountKurus = Math.round(amount * 100);
    await this.firebase.db.doc(`tenants/${tenantId}/paymentSaasOrders/${id}`).set({
      id, planId: dto.planId, billingCycle: dto.billingCycle, amountKurus,
      status: 'open', createdAt: now, createdBy: this.tenant.getUserId(),
    });
    return { id, planId: dto.planId, billingCycle: dto.billingCycle, amountKurus };
  }

  /** Staff checkout (owner/admin): a vet sale, a gym receivable or the SaaS order. */
  async createCheckout(dto: CreateCheckoutDto, ip: string, origin?: string) {
    const tenantId = this.tenant.getTenantId();
    if (dto.source === 'saas_subscription' && this.tenant.getStore().role !== 'owner') {
      throw new AppException(ErrorCode.FORBIDDEN_ROLE, 'Only the tenant owner can start a SaaS checkout');
    }
    const { amountKurus, buyerId } = await this.resolveSource(tenantId, dto.source, dto.sourceId);
    const userId = dto.source === 'gym_receivable' ? buyerId : null;
    return this.startCheckout({ source: dto.source, sourceId: dto.sourceId, amountKurus, buyerId, userId, buyer: dto, ip, origin });
  }

  /**
   * Member card payment from the panel / app: a package purchase, a wallet top-up or the member's
   * own debt plan. Amounts always come from the server (package price, open debt); only the
   * top-up amount is chosen by the member, within limits.
   */
  async createMemberCheckout(dto: MemberCheckoutDto, ip: string, origin?: string) {
    const tenantId = this.tenant.getTenantId();
    const userId = this.tenant.getUserId();
    const col = (name: string) => this.firebase.db.collection(tenantCollectionPath(tenantId, name));
    const memberSnap = await col(TENANT_COLLECTION.gymMembers).doc(userId).get();
    const member = memberSnap.data() as GymMember | undefined;
    if (!member || isDeleted(member)) throw new AppException(ErrorCode.GYM_MEMBER_NOT_FOUND, 'Member not found');

    let source: PaymentSource;
    let sourceId: string;
    let amountKurus: number;
    if (dto.purpose === 'package') {
      const pkg = (await col(TENANT_COLLECTION.gymPackages).doc(dto.packageId ?? '-').get()).data() as GymPackage | undefined;
      if (!pkg || isDeleted(pkg) || pkg.status !== 'active' || pkg.isHidden) {
        throw new AppException(ErrorCode.GYM_PACKAGE_NOT_FOUND, 'Package not found');
      }
      source = 'gym_member_package';
      sourceId = pkg.id;
      amountKurus = Math.round(Number(pkg.price ?? 0) * 100);
    } else if (dto.purpose === 'wallet_topup') {
      amountKurus = Math.round(Number(dto.amount ?? 0) * 100);
      if (!Number.isFinite(amountKurus) || amountKurus < WALLET_TOPUP_MIN_KURUS || amountKurus > WALLET_TOPUP_MAX_KURUS) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Top-up amount must be between 50 and 20000 TL');
      }
      source = 'gym_wallet_topup';
      sourceId = userId;
    } else {
      const resolved = await this.resolveSource(tenantId, 'gym_receivable', dto.receivableId ?? '-');
      if (resolved.buyerId !== userId) throw new AppException(ErrorCode.GYM_RECEIVABLE_NOT_FOUND, 'Receivable not found');
      source = 'gym_receivable';
      sourceId = dto.receivableId!;
      amountKurus = resolved.amountKurus;
    }
    if (amountKurus <= 0) throw new AppException(ErrorCode.FINANCE_INVALID, 'No positive amount to pay');

    const gym = (await this.firebase.db.doc(`${tenantCollectionPath(tenantId, TENANT_COLLECTION.gymInfo)}/${tenantId}`).get()).data() ?? {};
    const [name, ...rest] = (member.displayName || 'Üye').trim().split(/\s+/);
    const buyer: Buyer = {
      name,
      surname: rest.join(' ') || name,
      // iyzico requires an identity number; members without a T.C. no use the documented placeholder.
      identityNumber: dto.identityNumber ?? member.nationalId ?? '11111111111',
      email: member.email,
      gsmNumber: dto.gsmNumber ?? member.phone ?? '+905000000000',
      address: dto.address ?? String(gym['address'] ?? 'Türkiye'),
      city: dto.city ?? String(gym['city'] ?? 'Istanbul'),
      country: 'Turkey',
    };
    return this.startCheckout({ source, sourceId, amountKurus, buyerId: userId, userId, buyer, ip, origin });
  }

  async get(id: string) {
    return this.publicSession(await this.getSessionForTenant(id));
  }

  /** Member view of their own session (the result page polls it). */
  async getOwn(id: string) {
    const session = await this.getSessionForTenant(id);
    if (session.userId !== this.tenant.getUserId()) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Payment session was not found');
    }
    return this.publicSession(session);
  }

  /** Where the browser goes after iyzico's callback: the panel result page of the session. */
  async returnUrl(id: string, outcome: 'succeeded' | 'failed' | 'pending' | 'error'): Promise<string | null> {
    const snapshot = await this.sessions().doc(id).get();
    const session = snapshot.data() as PaymentSession | undefined;
    if (!session) return null;
    if (session.source === 'saas_subscription') {
      // Outside the subscription guard: an expired gym must be able to see its payment result.
      const url = new URL(`${session.returnOrigin ?? DEFAULT_RETURN_ORIGINS[0]}/subscription-result`);
      url.searchParams.set('paymentSession', id);
      url.searchParams.set('status', outcome);
      return url.toString();
    }
    if (session.source === 'rentacar_reservation') {
      const url = new URL(`${session.returnOrigin ?? DEFAULT_RETURN_ORIGINS[0]}/app/rezervasyonlar`);
      url.searchParams.set('paymentSession', id);
      url.searchParams.set('status', outcome);
      return url.toString();
    }
    if (!isGymSource(session.source)) return null;
    const url = new URL(`${session.returnOrigin ?? DEFAULT_RETURN_ORIGINS[0]}/payment-result`);
    url.searchParams.set('paymentSession', id);
    url.searchParams.set('status', outcome);
    return url.toString();
  }

  async reconcile(id: string) {
    const session = await this.getSessionForTenant(id);
    if (!session.token) throw new AppException(ErrorCode.INVALID_STATUS, 'Checkout has no token yet');
    await this.handleCallback(id, session.token);
    return this.get(id);
  }

  /** Member's "check again" on the result page (own sessions only). */
  async reconcileOwn(id: string) {
    const session = await this.getSessionForTenant(id);
    if (session.userId !== this.tenant.getUserId() || !session.token) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Payment session was not found');
    }
    await this.handleCallback(id, session.token);
    return this.getOwn(id);
  }

  /**
   * iyzico callback (and reconcile). The callback body is never trusted: the result is retrieved
   * from iyzico by token and checked (signature, amount, currency, basket). Success is applied
   * once, in the same transaction that marks the session paid; repeated callbacks are no-ops.
   */
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
    let credentials: IyzicoCredentials | undefined;
    // Older sessions (no scope) were created with the platform keys.
    if (session.credentialScope === 'tenant') {
      credentials = (await this.gymCredentials?.resolve(session.tenantId)) ?? undefined;
      if (!credentials) throw new AppException(ErrorCode.INVALID_STATUS, 'The gym payment keys are no longer available');
    }
    const verified = await provider.verifyCheckout(token, { id, amountKurus: session.amountKurus }, credentials);
    let renewedMember: GymMember | null = null;
    await this.firebase.db.runTransaction(async (tx) => {
      const lock = this.firebase.db.doc(`tenants/${session.tenantId}/paymentReservations/${session.source}_${session.sourceId}`);
      const orderRef = session.source === 'saas_subscription'
        ? this.firebase.db.doc(`tenants/${session.tenantId}/paymentSaasOrders/${session.sourceId}`) : null;
      const orderSnapshot = orderRef ? await tx.get(orderRef) : null;
      const tenantRef = orderRef ? this.firebase.db.doc(`tenants/${session.tenantId}`) : null;
      const subscriptionRef = orderRef
        ? this.firebase.db.doc(`${tenantCollectionPath(session.tenantId, TENANT_COLLECTION.gymSaasSubscription)}/${session.tenantId}`)
        : null;
      const subscriptionSnapshot = subscriptionRef ? await tx.get(subscriptionRef) : null;
      const [latest, reservation] = await Promise.all([tx.get(ref), tx.get(lock)]);
      const current = latest.data() as PaymentSession;
      // An abandoned (superseded or expired) session can still be paid on an old tab: honour it.
      if (current.token !== token || !['pending', 'abandoned'].includes(current.status)) return;
      // Gym effects read their documents here, before the first write of the transaction.
      const fulfil = verified.status === 'succeeded' && isGymSource(current.source) && !current.fulfilledAt;
      if (fulfil) {
        renewedMember = (await fulfillGymPayment(this.firebase.db, tx, current, verified.providerPaymentId)).renewedMember;
      }
      if (verified.status === 'succeeded' && orderRef) {
        const order = orderSnapshot?.data();
        if (!order || order.status !== 'open' || order.amountKurus !== current.amountKurus) {
          throw new AppException(ErrorCode.FINANCE_INVALID, 'SaaS order cannot be verified');
        }
        // Test (sandbox) payments only activate when explicitly allowed, so a test card cannot buy
        // a real subscription while the platform keys are still sandbox keys.
        const activates = current.mode === 'live' || process.env.SAAS_ACTIVATE_ON_SANDBOX === 'true';
        const paidAt = new Date().toISOString();
        if (!activates) {
          tx.update(orderRef, { status: 'sandbox_succeeded', sessionId: id, updatedAt: paidAt });
        } else {
          const subscription = subscriptionSnapshot?.data() as { currentPeriodEndsAt?: string; status?: string } | undefined;
          const currentEnd = subscription?.status === 'active' ? subscription.currentPeriodEndsAt : null;
          const period = nextPeriod(currentEnd, order.billingCycle as SaasCycle, new Date(paidAt));
          tx.set(subscriptionRef!, {
            ...(subscription ?? { id: session.tenantId, tenantId: session.tenantId, createdAt: paidAt, deletedAt: null }),
            planId: order.planId,
            billingCycle: order.billingCycle,
            status: 'active',
            currentPeriodStartsAt: period.startsAt,
            currentPeriodEndsAt: period.endsAt,
            lastPaymentAt: paidAt,
            lastPaymentSessionId: id,
            updatedAt: paidAt,
            updatedBy: 'system:billing',
          });
          tx.update(tenantRef!, { membershipStatus: 'active', subscriptionEndsAt: period.endsAt, updatedAt: paidAt });
          tx.set(this.firebase.db.doc(`tenants/${session.tenantId}/saasPayments/${id}`), {
            id,
            receiptNo: receiptNo(id, paidAt),
            planId: order.planId,
            billingCycle: order.billingCycle,
            amountKurus: current.amountKurus,
            currency: 'TRY',
            provider: current.provider,
            providerPaymentId: verified.providerPaymentId,
            mode: current.mode ?? 'sandbox',
            periodStartsAt: period.startsAt,
            periodEndsAt: period.endsAt,
            paidAt,
            paidBy: current.createdBy,
          });
          tx.update(orderRef, { status: 'paid', sessionId: id, updatedAt: paidAt });
        }
      }
      const at = new Date().toISOString();
      if (verified.status === 'succeeded' && current.source === 'rentacar_reservation' && !current.fulfilledAt) {
        const reservationRef = this.firebase.db.doc(`${tenantCollectionPath(current.tenantId, TENANT_COLLECTION.rentReservations)}/${current.sourceId}`);
        const reservationSnapshot = await tx.get(reservationRef);
        const rentReservation = reservationSnapshot.data();
        if (!rentReservation || rentReservation.deletedAt || Math.round(Number(rentReservation.price?.totalAmount ?? 0) * 100) !== current.amountKurus) {
          throw new AppException(ErrorCode.FINANCE_INVALID, 'Rezervasyon ödeme tutarı doğrulanamadı.');
        }
        tx.update(reservationRef, { status: 'confirmed', updatedAt: at, updatedBy: 'system:payments', version: Number(rentReservation.version ?? 0) + 1 });
        tx.set(this.firebase.db.doc(`${tenantCollectionPath(current.tenantId, TENANT_COLLECTION.rentTransactions)}/${current.id}`), {
          id: current.id, tenantId: current.tenantId, branchId: rentReservation.branchId, customerId: rentReservation.customerId,
          reservationId: current.sourceId, rentalId: null, kind: 'payment', method: 'online', amount: current.amountKurus / 100,
          currency: 'TRY', status: 'completed', reference: verified.providerPaymentId, reversalOf: null,
          createdAt: at, createdBy: 'system:payments', updatedAt: at, updatedBy: 'system:payments', deletedAt: null, version: 1,
        });
      }
      tx.update(ref, {
        status: verified.status === 'pending' ? current.status : verified.status,
        providerPaymentId: verified.providerPaymentId,
        ...(verified.status === 'pending' ? { reviewPending: true } : {}),
        ...(fulfil || (verified.status === 'succeeded' && current.source === 'rentacar_reservation') ? { fulfilledAt: at } : {}),
        updatedAt: at,
      });
      if (reservation.data()?.sessionId === id) tx.update(lock, { status: verified.status });
    });
    if (renewedMember) await this.syncAccess(session.tenantId, renewedMember);
    return { status: verified.status };
  }

  // ─── Internals ───────────────────────────────────────────────────────────────────────────

  private async startCheckout(input: {
    source: PaymentSource;
    sourceId: string;
    amountKurus: number;
    buyerId: string;
    userId: string | null;
    buyer: Buyer;
    ip: string;
    origin?: string;
  }) {
    const tenantId = this.tenant.getTenantId();
    // SaaS subscription payments go to the platform account; everything else to the gym's own.
    const platform = input.source === 'saas_subscription';
    let credentials: IyzicoCredentials | undefined;
    if (platform) {
      // Odivon's own account: no per-gym provider choice, only the platform keys are needed.
      if (!this.providers.get('iyzico')!.configured()) throw new AppException(ErrorCode.INVALID_STATUS, 'Online subscription payment is not available yet');
    } else {
      credentials = (await this.gymCredentials?.resolve(tenantId)) ?? undefined;
      if (!credentials) throw new AppException(ErrorCode.INVALID_STATUS, 'Card payments are not set up for this gym');
    }
    const selected = 'iyzico' as const;
    const provider = this.providers.get(selected)!;
    const now = new Date();
    const id = randomUUID();
    const session: PaymentSession = {
      id, tenantId, provider: selected, source: input.source, sourceId: input.sourceId,
      amountKurus: input.amountKurus, currency: 'TRY', status: 'initializing', token: null, paymentPageUrl: null,
      providerPaymentId: null, createdBy: this.tenant.getUserId(), createdAt: now.toISOString(), updatedAt: now.toISOString(),
      userId: input.userId, returnOrigin: this.returnOrigin(input.origin), fulfilledAt: null,
      credentialScope: platform ? 'platform' : 'tenant',
      mode: platform ? provider.mode() : credentials!.mode,
    };
    const ref = this.sessions().doc(id);
    const lock = this.firebase.db.doc(`tenants/${tenantId}/paymentReservations/${input.source}_${input.sourceId}`);
    let existing: PaymentSession | null = null;
    await this.firebase.db.runTransaction(async (tx) => {
      existing = null;
      const data = (await tx.get(lock)).data();
      const previous = data?.sessionId ? ((await tx.get(this.sessions().doc(String(data.sessionId)))).data() as PaymentSession | undefined) : undefined;
      const live = previous && ['initializing', 'pending'].includes(previous.status);
      if (live) {
        const fresh = now.getTime() - Date.parse(previous!.createdAt) < CHECKOUT_TTL_MS;
        if (fresh && previous!.status === 'pending' && previous!.paymentPageUrl && previous!.amountKurus === input.amountKurus) {
          existing = previous!;
          return;
        }
        if (fresh && previous!.status === 'initializing') {
          throw new AppException(ErrorCode.INVALID_STATUS, 'A checkout for this record is already being processed');
        }
        // Expired or different amount: the old page may still be paid, so it stays verifiable.
        tx.update(this.sessions().doc(previous!.id), { status: 'abandoned', updatedAt: now.toISOString() });
      }
      tx.set(lock, { sessionId: id, status: 'initializing', createdAt: now.toISOString() });
      tx.set(ref, session);
    });
    if (existing) return this.publicSession(existing);

    const checkoutInput: CheckoutInput = {
      id, amountKurus: input.amountKurus, source: input.source, sourceId: input.sourceId,
      callbackUrl: `${process.env.PAYMENT_PUBLIC_BASE_URL ?? 'https://mainapi.odivon.com'}/api/v1/payments/callback/iyzico/${id}`,
      buyer: { id: input.buyerId, ...input.buyer, ip: input.ip },
    };
    try {
      const checkout = await provider.createCheckout(checkoutInput, credentials);
      await this.firebase.db.runTransaction(async (tx) => {
        tx.update(ref, { token: checkout.token, paymentPageUrl: checkout.paymentPageUrl,
          status: 'pending', updatedAt: new Date().toISOString() });
        tx.update(lock, { status: 'pending' });
      });
      return this.publicSession({ ...session, ...checkout, status: 'pending' });
    } catch (error) {
      await this.firebase.db.runTransaction(async (tx) => {
        tx.update(ref, { status: 'failed', updatedAt: new Date().toISOString() });
        tx.update(lock, { status: 'failed' });
      });
      throw error;
    }
  }

  /** The panel origin to send the browser back to; only known panel origins are accepted. */
  private returnOrigin(origin?: string): string {
    const allowed = (process.env.PAYMENT_RETURN_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)) ?? DEFAULT_RETURN_ORIGINS;
    return origin && allowed.includes(origin) ? origin : allowed[0];
  }

  private async syncAccess(tenantId: string, member: GymMember) {
    if (!this.accessSync) return;
    try {
      await this.tenant.run({ tenantId, userId: 'system:payments', role: 'owner', modules: ['gym'], email: '' }, () =>
        this.accessSync!.syncMemberSafely(member));
    } catch (error) {
      this.logger.warn(`Turnstile sync after card payment failed: ${(error as Error).message}`);
    }
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

  private async resolveSource(tenantId: string, source: PaymentSource, id: string): Promise<{ amountKurus: number; buyerId: string }> {
    if (source === 'saas_subscription') {
      const snapshot = await this.firebase.db.doc(`tenants/${tenantId}/paymentSaasOrders/${id}`).get();
      const order = snapshot.data();
      if (!order || order.status !== 'open') throw new AppException(ErrorCode.FINANCE_INVALID, 'SaaS order is not open');
      return { amountKurus: Number(order.amountKurus), buyerId: tenantId };
    }
    if (source === 'rentacar_reservation') {
      const snapshot = await this.firebase.db.doc(`${tenantCollectionPath(tenantId, TENANT_COLLECTION.rentReservations)}/${id}`).get();
      const reservation = snapshot.data();
      if (!reservation || reservation.deletedAt || !['pending_payment', 'confirmed'].includes(String(reservation.status))) {
        throw new AppException(ErrorCode.FINANCE_INVALID, 'Rezervasyon ödeme için uygun değil.');
      }
      const amountKurus = Math.round(Number(reservation.price?.totalAmount ?? 0) * 100);
      if (!Number.isFinite(amountKurus) || amountKurus <= 0) throw new AppException(ErrorCode.FINANCE_INVALID, 'Ödenecek tutar bulunamadı.');
      return { amountKurus, buyerId: String(reservation.customerId) };
    }
    if (source !== 'vet_sale' && source !== 'gym_receivable') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Use the member checkout for this payment');
    }
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

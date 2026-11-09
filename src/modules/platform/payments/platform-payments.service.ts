import { Injectable } from '@nestjs/common';
import { ProductModule } from '../../../shared/authorization/constants';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { IyzicoProvider } from '../../payments/iyzico.provider';
import { PAYMENT_EVENTS_COLLECTION, PaymentEventDoc, PaymentEventsService } from '../../payments/monitoring/payment-events.service';
import { PaymentModesService } from '../../payments/monitoring/payment-modes.service';
import { PaymentSession } from '../../payments/payment-provider';
import { PaytrProvider } from '../../payments/paytr.provider';
import { pricingProduct } from '../../saas-pricing/saas-pricing.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PaymentEventsQuery, PaymentSessionsQuery } from './dto';

const DAY_MS = 24 * 3600 * 1000;

interface TenantInfo {
  id: string;
  name: string;
  modules: string[];
}

export type PlatformPaymentSession = Omit<PaymentSession, 'token'> & {
  tenantName: string | null;
  product: string | null;
};

export interface ProductStats {
  total: number;
  succeeded: number;
  failed: number;
  pending: number;
  abandoned: number;
  reviewPending: number;
  liveAmountKurus: number;
  sandboxAmountKurus: number;
  lastPaymentAt: string | null;
}

const emptyStats = (): ProductStats => ({
  total: 0, succeeded: 0, failed: 0, pending: 0, abandoned: 0, reviewPending: 0,
  liveAmountKurus: 0, sandboxAmountKurus: 0, lastPaymentAt: null,
});

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

/** `****56`: enough to tell which merchant account is in use, nothing more. */
function hint(value: string | undefined): string | null {
  if (!value) return null;
  return `****${value.slice(-2)}`;
}

/**
 * Management panel view of online payments (PayTR / iyzico): TEST / CANLI mode per product,
 * checkout sessions with their result, the payment event log and payments waiting for review.
 * Keys are never returned; only whether they are set.
 */
@Injectable()
export class PlatformPaymentsService {
  private readonly paytr = new PaytrProvider();
  private readonly iyzico = new IyzicoProvider();

  constructor(
    private readonly firebase: FirebaseService,
    private readonly modes: PaymentModesService,
    private readonly events: PaymentEventsService,
    private readonly audit: PlatformAuditService,
  ) {}

  private sessions() {
    return this.firebase.db.collection('paymentSessions');
  }

  private eventsCol() {
    return this.firebase.db.collection(PAYMENT_EVENTS_COLLECTION);
  }

  private async tenants(): Promise<Map<string, TenantInfo>> {
    const snapshot = await this.firebase.db.collection(ROOT_COLLECTION.tenants).get();
    const map = new Map<string, TenantInfo>();
    for (const doc of snapshot.docs) {
      const data = doc.data();
      map.set(doc.id, { id: doc.id, name: String(data['name'] ?? doc.id), modules: Array.isArray(data['modules']) ? data['modules'] : [] });
    }
    return map;
  }

  private async sessionsSince(days: number): Promise<PaymentSession[]> {
    const from = new Date(Date.now() - days * DAY_MS).toISOString();
    const snapshot = await this.sessions().where('createdAt', '>=', from).get();
    return snapshot.docs.map((doc) => doc.data() as PaymentSession);
  }

  private toPlatform(session: PaymentSession, tenants: Map<string, TenantInfo>): PlatformPaymentSession {
    const { token: _token, ...rest } = session;
    const tenant = tenants.get(session.tenantId);
    return {
      ...rest,
      tenantName: tenant?.name ?? null,
      // Older sessions have no product: derive it the way the price was derived.
      product: session.product ?? pricingProduct(tenant?.modules, session.planId ?? undefined),
    };
  }

  private config() {
    const base = process.env.PAYMENT_PUBLIC_BASE_URL ?? 'https://mainapi.odivon.com';
    return {
      saasProvider: process.env.SAAS_PAYMENT_PROVIDER === 'paytr' ? 'paytr' : 'iyzico',
      activateOnSandbox: process.env.SAAS_ACTIVATE_ON_SANDBOX === 'true',
      paytr: {
        configured: this.paytr.configured(),
        defaultMode: this.paytr.mode(),
        merchantIdHint: hint(process.env.PAYTR_MERCHANT_ID),
        notificationUrl: `${base}/api/v1/payments/callback/paytr`,
      },
      iyzico: { configured: this.iyzico.configured(), mode: this.iyzico.mode() },
    };
  }

  async overview(daysParam?: string) {
    const days = clampInt(daysParam, 30, 1, 365);
    const config = this.config();
    const [modes, sessions, tenants, reviews, errors] = await Promise.all([
      this.modes.list(config.paytr.defaultMode, true),
      this.sessionsSince(days),
      this.tenants(),
      this.firebase.db.collection('paymentReviews').where('resolvedAt', '==', null).get(),
      this.eventsCol().where('createdAt', '>=', new Date(Date.now() - DAY_MS).toISOString()).get(),
    ]);
    const saas = sessions.filter((session) => session.source === 'saas_subscription').map((session) => this.toPlatform(session, tenants));
    const byProduct = new Map<string, ProductStats>();
    const totals = emptyStats();
    for (const session of saas) {
      const stats = byProduct.get(session.product ?? 'unknown') ?? emptyStats();
      for (const target of [stats, totals]) {
        target.total += 1;
        if (session.status === 'succeeded') {
          target.succeeded += 1;
          if (session.mode === 'live') target.liveAmountKurus += session.amountKurus;
          else target.sandboxAmountKurus += session.amountKurus;
          if (!target.lastPaymentAt || session.updatedAt > target.lastPaymentAt) target.lastPaymentAt = session.updatedAt;
        } else if (session.status === 'failed') target.failed += 1;
        else if (session.status === 'abandoned') target.abandoned += 1;
        else target.pending += 1;
        if (session.reviewPending) target.reviewPending += 1;
      }
      byProduct.set(session.product ?? 'unknown', stats);
    }
    const errorEvents = errors.docs.map((doc) => doc.data() as PaymentEventDoc).filter((event) => event.level === 'error');
    return {
      days,
      config,
      products: modes.map((mode) => ({ ...mode, stats: byProduct.get(mode.product) ?? emptyStats() })),
      unknownProductStats: byProduct.get('unknown') ?? null,
      totals,
      openReviews: reviews.size,
      errorsLast24h: errorEvents.length,
    };
  }

  async listSessions(query: PaymentSessionsQuery) {
    const days = clampInt(query.days, 30, 1, 365);
    const limit = clampInt(query.limit, 200, 1, 500);
    const [sessions, tenants] = await Promise.all([this.sessionsSince(days), this.tenants()]);
    const needle = query.q?.trim().toLowerCase();
    let items = sessions
      .filter((session) => (query.source === 'all' ? true : session.source === (query.source || 'saas_subscription')))
      .map((session) => this.toPlatform(session, tenants))
      .filter((session) =>
        (!query.status || (query.status === 'review' ? Boolean(session.reviewPending) : session.status === query.status)) &&
        (!query.mode || (session.mode ?? 'sandbox') === query.mode) &&
        (!query.provider || session.provider === query.provider) &&
        (!query.product || session.product === query.product) &&
        (!query.tenantId || session.tenantId === query.tenantId) &&
        (!needle || [session.id, session.tenantId, session.tenantName, session.sourceId, session.providerPaymentId, session.errorMessage]
          .some((value) => String(value ?? '').toLowerCase().includes(needle))));
    items = items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { total: items.length, items: items.slice(0, limit), days };
  }

  async sessionDetail(id: string) {
    const snapshot = await this.sessions().doc(id).get();
    if (!snapshot.exists) throw new AppException(ErrorCode.INVALID_STATUS, 'Ödeme oturumu bulunamadı');
    const session = snapshot.data() as PaymentSession;
    const isSaas = session.source === 'saas_subscription';
    const [tenantSnap, orderSnap, reviewSnap, receiptSnap, sessionEvents, orderEvents] = await Promise.all([
      this.firebase.db.doc(`tenants/${session.tenantId}`).get(),
      isSaas ? this.firebase.db.doc(`tenants/${session.tenantId}/paymentSaasOrders/${session.sourceId}`).get() : Promise.resolve(null),
      this.firebase.db.doc(`paymentReviews/${id}`).get(),
      isSaas ? this.firebase.db.doc(`tenants/${session.tenantId}/saasPayments/${id}`).get() : Promise.resolve(null),
      this.eventsCol().where('sessionId', '==', id).get(),
      isSaas ? this.eventsCol().where('orderId', '==', session.sourceId).get() : Promise.resolve(null),
    ]);
    const tenantData = tenantSnap.data();
    const tenants = new Map<string, TenantInfo>();
    if (tenantData) {
      tenants.set(session.tenantId, { id: session.tenantId, name: String(tenantData['name'] ?? session.tenantId),
        modules: Array.isArray(tenantData['modules']) ? tenantData['modules'] : [] });
    }
    const seen = new Set<string>();
    const events = [...sessionEvents.docs, ...(orderEvents?.docs ?? [])]
      .map((doc) => doc.data() as PaymentEventDoc)
      .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return {
      session: this.toPlatform(session, tenants),
      tenant: tenantData ? { id: session.tenantId, name: tenantData['name'] ?? null, membershipStatus: tenantData['membershipStatus'] ?? null,
        subscriptionEndsAt: tenantData['subscriptionEndsAt'] ?? null, modules: tenantData['modules'] ?? [] } : null,
      order: orderSnap?.data() ?? null,
      review: reviewSnap.data() ?? null,
      receipt: receiptSnap?.data() ?? null,
      events,
    };
  }

  async listEvents(query: PaymentEventsQuery) {
    const days = clampInt(query.days, 7, 1, 90);
    const limit = clampInt(query.limit, 300, 1, 1000);
    const from = new Date(Date.now() - days * DAY_MS).toISOString();
    const [snapshot, tenants] = await Promise.all([this.eventsCol().where('createdAt', '>=', from).get(), this.tenants()]);
    const needle = query.q?.trim().toLowerCase();
    const items = snapshot.docs
      .map((doc) => doc.data() as PaymentEventDoc)
      .filter((event) =>
        (!query.level || event.level === query.level) &&
        (!query.type || event.type === query.type) &&
        (!query.product || event.product === query.product) &&
        (!query.tenantId || event.tenantId === query.tenantId) &&
        (!needle || [event.message, event.sessionId, event.orderId, event.tenantId, JSON.stringify(event.detail ?? {})]
          .some((value) => String(value ?? '').toLowerCase().includes(needle))))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((event) => ({ ...event, tenantName: event.tenantId ? tenants.get(event.tenantId)?.name ?? null : null }));
    return { total: items.length, items: items.slice(0, limit), days };
  }

  async listReviews(status = 'open') {
    const [snapshot, tenants] = await Promise.all([this.firebase.db.collection('paymentReviews').get(), this.tenants()]);
    const items = snapshot.docs
      .map((doc) => doc.data() as Record<string, unknown> & { id: string; tenantId: string; createdAt: string; resolvedAt: string | null })
      .filter((review) => status === 'all' || (status === 'resolved' ? Boolean(review.resolvedAt) : !review.resolvedAt))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((review) => ({ ...review, tenantName: tenants.get(review.tenantId)?.name ?? null }));
    return { total: items.length, items };
  }

  /** Marks a charged-but-not-applied payment as handled (e.g. refunded or extended by hand). */
  async resolveReview(id: string, note: string, admin: PlatformAdminUser) {
    const ref = this.firebase.db.doc(`paymentReviews/${id}`);
    const snapshot = await ref.get();
    const review = snapshot.data();
    if (!review) throw new AppException(ErrorCode.INVALID_STATUS, 'İnceleme kaydı bulunamadı');
    if (review['resolvedAt']) throw new AppException(ErrorCode.INVALID_STATUS, 'Bu kayıt zaten çözüldü');
    const at = new Date().toISOString();
    const actor = admin.email || admin.uid;
    await ref.update({ resolvedAt: at, resolvedBy: actor, resolutionNote: note });
    await this.sessions().doc(id).update({ reviewPending: false, updatedAt: at }).catch(() => undefined);
    await this.audit.record({
      adminUid: admin.uid, adminEmail: admin.email, action: 'PAYMENT_REVIEW_RESOLVED', targetType: 'payment',
      tenantId: String(review['tenantId'] ?? ''), targetId: id, before: { resolvedAt: null }, after: { resolvedAt: at }, reason: note,
    });
    await this.events.record({
      type: 'review_resolved', message: `İnceleme kapatıldı: ${note}`, sessionId: id, tenantId: String(review['tenantId'] ?? ''),
      provider: String(review['provider'] ?? ''), source: String(review['source'] ?? ''), amountKurus: Number(review['amountKurus'] ?? 0),
      detail: { resolvedBy: actor },
    });
    return { id, resolvedAt: at, resolvedBy: actor };
  }

  async setMode(product: ProductModule, mode: 'sandbox' | 'live' | 'default', reason: string | undefined, admin: PlatformAdminUser) {
    const actor = admin.email || admin.uid;
    const { before, after } = await this.modes.set(product, mode === 'default' ? null : mode, actor, this.paytr.mode(), reason);
    await this.audit.record({
      adminUid: admin.uid, adminEmail: admin.email, action: 'PAYMENT_MODE_UPDATED', targetType: 'payment', targetId: `mode:${product}`,
      before: { mode: before.mode, source: before.source }, after: { mode: after.mode, source: after.source }, reason: reason ?? null,
    });
    await this.events.record({
      type: 'mode_changed', level: after.mode === 'live' ? 'warn' : 'info', provider: 'paytr', product, mode: after.mode,
      message: `${product} ödeme modu ${before.mode === 'live' ? 'CANLI' : 'TEST'} → ${after.mode === 'live' ? 'CANLI' : 'TEST'}${after.source === 'default' ? ' (varsayılana döndü)' : ''}`,
      detail: { by: actor, reason: reason ?? null },
    });
    return after;
  }
}

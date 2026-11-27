/**
 * SaaS üyelik takibi: her altyapının (ana platform + harici API'ler) müşterilerinin abonelik
 * durumunu tek listede toplar. Harici API'ler kiracı listesindeki her kayda isteğe bağlı
 * `subscription` alanını ekleyerek bu listeye katılır (bkz. docs/saas-altyapi-entegrasyonu.md).
 */
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { computeTenantStatus, daysDifference } from '../shared/subscription-math';
import { PlatformBackend, RemoteSubscription, RemoteTenant } from './backend.types';

export const MEMBERSHIP_STATUSES = ['trial', 'active', 'past_due', 'expired', 'cancelled', 'none'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface MembershipRow {
  backendId: string;
  backendName: string;
  tenantId: string;
  tenantName: string;
  ownerEmail: string | null;
  tenantStatus: 'active' | 'suspended' | 'closed';
  modules: string[];
  plan: string | null;
  planName: string | null;
  status: MembershipStatus;
  billingCycle: 'monthly' | 'yearly' | null;
  startedAt: string | null;
  trialEndsAt: string | null;
  /** Deneme bitişi (trial) veya ödenmiş dönemin sonu. */
  endsAt: string | null;
  daysLeft: number | null;
  amount: number | null;
  currency: string | null;
  autoRenew: boolean | null;
  isDemo: boolean;
  createdAt: string | null;
}

export type MembershipCounts = Record<MembershipStatus, number>;

export interface MembershipBackendSummary {
  id: string;
  name: string;
  tenantSource: PlatformBackend['tenantSource'];
  /** Satırlar okunabildi mi? `none` kaynaklılar ve token/adres eksikleri false döner. */
  ok: boolean;
  error: string | null;
  /** Kayıtların en az biri abonelik bilgisi taşıyor mu? (harici API henüz alanı eklemediyse false) */
  hasSubscriptionData: boolean;
  total: number;
  counts: MembershipCounts;
}

export interface MembershipSummary {
  total: number;
  counts: MembershipCounts;
  /** Önümüzdeki 7 gün içinde bitecek deneme / abonelikler. */
  expiringSoon: number;
  /** Aktif ücretli aboneliklerin aylığa çevrilmiş tutarı, para birimine göre (yıllık / 12). */
  monthlyRecurring: Record<string, number>;
}

export interface MembershipOverview {
  items: MembershipRow[];
  summary: MembershipSummary;
  backends: MembershipBackendSummary[];
  generatedAt: string;
}

export const EXPIRING_SOON_DAYS = 7;

export const emptyCounts = (): MembershipCounts => ({
  trial: 0,
  active: 0,
  past_due: 0,
  expired: 0,
  cancelled: 0,
  none: 0,
});

const STATUS_ALIASES: Record<string, MembershipStatus> = {
  trial: 'trial',
  trialing: 'trial',
  deneme: 'trial',
  active: 'active',
  paid: 'active',
  aktif: 'active',
  past_due: 'past_due',
  pastdue: 'past_due',
  unpaid: 'past_due',
  overdue: 'past_due',
  expired: 'expired',
  ended: 'expired',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  iptal: 'cancelled',
  none: 'none',
  free: 'none',
};

const text = (v: unknown, max = 120): string | null =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : null;

const isoDate = (v: unknown): string | null => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const ms = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const cycle = (v: unknown): 'monthly' | 'yearly' | null => {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (['monthly', 'month', 'aylik', 'aylık'].includes(s)) return 'monthly';
  if (['yearly', 'year', 'annual', 'annually', 'yillik', 'yıllık'].includes(s)) return 'yearly';
  return null;
};

/** Harici API'nin ham abonelik bilgisini güvenli ve tek tip hale getirir. */
export function normalizeRemoteSubscription(
  raw: unknown,
  now = new Date(),
): Pick<
  MembershipRow,
  'plan' | 'planName' | 'status' | 'billingCycle' | 'startedAt' | 'trialEndsAt' | 'endsAt' | 'daysLeft' | 'amount' | 'currency' | 'autoRenew'
> {
  const s = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as RemoteSubscription;
  const trialEndsAt = isoDate(s.trialEndsAt);
  const periodEnd = isoDate(s.currentPeriodEnd);
  let status: MembershipStatus =
    STATUS_ALIASES[String(s.status ?? '').toLowerCase().replace(/[\s-]/g, '_')] ?? (raw ? 'active' : 'none');
  const endsAt = status === 'trial' ? trialEndsAt ?? periodEnd : periodEnd ?? (status === 'none' ? null : trialEndsAt);
  // API "aktif/deneme" dese de tarihi geçmişse süresi dolmuş say.
  if ((status === 'trial' || status === 'active') && endsAt && Date.parse(endsAt) < now.getTime()) status = 'expired';
  const amount = typeof s.amount === 'number' && Number.isFinite(s.amount) && s.amount >= 0 ? Math.round(s.amount * 100) / 100 : null;
  return {
    plan: text(s.plan, 60),
    planName: text(s.planName, 80),
    status,
    billingCycle: cycle(s.billingCycle),
    startedAt: isoDate(s.startedAt),
    trialEndsAt,
    endsAt,
    daysLeft: daysDifference(endsAt, now),
    amount,
    currency: amount === null ? null : (text(s.currency, 3)?.toUpperCase() ?? 'TRY'),
    autoRenew: typeof s.autoRenew === 'boolean' ? s.autoRenew : null,
  };
}

export function remoteTenantToRow(
  backend: Pick<PlatformBackend, 'id' | 'name'>,
  t: RemoteTenant,
  now = new Date(),
): MembershipRow {
  return {
    backendId: backend.id,
    backendName: backend.name,
    tenantId: String(t.id),
    tenantName: text(t.name, 160) ?? String(t.id),
    ownerEmail: text(t.ownerEmail, 200),
    tenantStatus: t.status === 'suspended' || t.status === 'closed' ? t.status : 'active',
    modules: Array.isArray(t.modules) ? t.modules.filter((m) => typeof m === 'string').slice(0, 40) : [],
    isDemo: t.isDemo === true,
    createdAt: isoDate(t.createdAt),
    ...normalizeRemoteSubscription(t.subscription ?? null, now),
  };
}

/** Ana platform kiracısını aynı satır biçimine çevirir (tenants koleksiyonu). */
export function mainTenantToRow(backend: Pick<PlatformBackend, 'id' | 'name'>, t: TenantDocument, now = new Date()): MembershipRow {
  const state = computeTenantStatus(t, now);
  const raw = t.membershipStatus ?? 'active';
  let status: MembershipStatus;
  if (raw === 'cancelled') status = 'cancelled';
  else if (state.computedStatus === 'suspended') {
    const ends = state.effectiveEndsAt ? Date.parse(state.effectiveEndsAt) : NaN;
    status = Number.isFinite(ends) && ends < now.getTime() ? 'expired' : raw === 'trial' ? 'trial' : raw === 'expired' ? 'expired' : 'active';
  } else status = state.computedStatus;
  const endsAt = state.effectiveEndsAt;
  return {
    backendId: backend.id,
    backendName: backend.name,
    tenantId: t.id,
    tenantName: t.name || t.id,
    ownerEmail: null,
    tenantStatus: t.status === 'inactive' ? 'suspended' : 'active',
    modules: t.modules ?? [],
    plan: t.planId ?? null,
    planName: null,
    status,
    billingCycle: t.billingCycle ?? null,
    startedAt: null,
    trialEndsAt: t.trialEndsAt ?? null,
    endsAt,
    daysLeft: daysDifference(endsAt, now),
    amount: null,
    currency: null,
    autoRenew: null,
    isDemo: Boolean(t.isDemo),
    createdAt: t.createdAt ?? null,
  };
}

export function countStatuses(rows: MembershipRow[]): MembershipCounts {
  const counts = emptyCounts();
  rows.forEach((r) => (counts[r.status] += 1));
  return counts;
}

export function summarize(rows: MembershipRow[]): MembershipSummary {
  const monthlyRecurring: Record<string, number> = {};
  let expiringSoon = 0;
  for (const r of rows) {
    if ((r.status === 'trial' || r.status === 'active') && r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft <= EXPIRING_SOON_DAYS) {
      expiringSoon += 1;
    }
    if (r.status === 'active' && r.amount && r.currency && !r.isDemo) {
      const monthly = r.billingCycle === 'yearly' ? r.amount / 12 : r.amount;
      monthlyRecurring[r.currency] = Math.round(((monthlyRecurring[r.currency] ?? 0) + monthly) * 100) / 100;
    }
  }
  return { total: rows.length, counts: countStatuses(rows), expiringSoon, monthlyRecurring };
}

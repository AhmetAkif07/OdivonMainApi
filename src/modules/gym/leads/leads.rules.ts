import { gymToday, toKurus, toTl } from '../ops/receivables.math';

/**
 * Prospective members ("misafir üye" records) move through these stages. `visited`, `called`,
 * `converted` and `lost` are the statuses the panel has always used; `trial` (deneme antrenmanı)
 * sits between being called and signing up.
 */
export const LEAD_STAGES = ['visited', 'called', 'trial', 'converted', 'lost'] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

/** Order of the funnel; `lost` is an exit, not a step. */
const FUNNEL: LeadStage[] = ['visited', 'called', 'trial', 'converted'];

export const LEAD_SOURCES = ['walk_in', 'instagram', 'google', 'website', 'phone', 'referral', 'campaign', 'other'] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export interface StageEvent {
  stage: LeadStage;
  at: string;
  by: string;
}

export interface LeadRecord {
  id: string;
  createdAt: string;
  createdBy?: string;
  deletedAt?: string | null;
  fullName?: string;
  status?: string;
  source?: string | null;
  stageHistory?: StageEvent[];
  convertedAt?: string | null;
  convertedMemberId?: string | null;
  lostReason?: string | null;
  followUpDate?: string | null;
  assignedStaffName?: string | null;
  branchId?: string | null;
  referrerMemberId?: string | null;
}

export function isLeadStage(value: unknown): value is LeadStage {
  return typeof value === 'string' && (LEAD_STAGES as readonly string[]).includes(value);
}

function stageOf(lead: Pick<LeadRecord, 'status'>): LeadStage {
  return isLeadStage(lead.status) ? lead.status : 'visited';
}

/** History of a lead; records from before stages were tracked start with their creation. */
export function historyOf(lead: LeadRecord): StageEvent[] {
  if (lead.stageHistory?.length) return lead.stageHistory;
  return [{ stage: 'visited', at: lead.createdAt, by: lead.createdBy ?? '' }];
}

/** Fields to write when a lead moves to `next`; empty when it is already there. */
export function stageChange(lead: LeadRecord, next: LeadStage, by: string, now = new Date()): Partial<LeadRecord> {
  if (stageOf(lead) === next && lead.stageHistory?.length) return {};
  const at = now.toISOString();
  const history = historyOf(lead);
  return {
    status: next,
    stageHistory: history.at(-1)?.stage === next ? history : [...history, { stage: next, at, by }],
    convertedAt: next === 'converted' ? (lead.convertedAt ?? at) : null,
    lostReason: next === 'lost' ? (lead.lostReason ?? null) : null,
  };
}

/** Furthest funnel step a lead reached (a lost lead keeps the step it had reached before). */
export function reachedStep(lead: LeadRecord): number {
  const stages = [...historyOf(lead).map((e) => e.stage), stageOf(lead)];
  return Math.max(0, ...stages.map((stage) => FUNNEL.indexOf(stage)));
}

const DAY_MS = 86_400_000;

function dayOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const time = Date.parse(iso);
  return Number.isNaN(time) ? '' : gymToday(new Date(time));
}

function rate(part: number, whole: number) {
  return whole ? Math.round((part / whole) * 1000) / 10 : 0;
}

function groupBy(leads: LeadRecord[], key: (lead: LeadRecord) => string) {
  const groups = new Map<string, LeadRecord[]>();
  for (const lead of leads) {
    const name = key(lead);
    groups.set(name, [...(groups.get(name) ?? []), lead]);
  }
  return [...groups.entries()]
    .map(([name, items]) => {
      const converted = items.filter((l) => stageOf(l) === 'converted').length;
      return { key: name, leads: items.length, converted, conversionRate: rate(converted, items.length) };
    })
    .sort((a, b) => b.leads - a.leads || a.key.localeCompare(b.key, 'tr'));
}

export interface FunnelQuery {
  from?: string;
  to?: string;
  branchId?: string;
}

/**
 * Funnel of the leads created in [from, to] (gym-local days): how many reached each step, where
 * they came from, who followed them up, why they were lost and how long converting took.
 */
export function funnelReport(all: LeadRecord[], query: FunnelQuery, today = gymToday()) {
  const leads = all.filter((lead) => {
    if (lead.deletedAt) return false;
    const day = dayOf(lead.createdAt);
    if (query.from && day < query.from) return false;
    if (query.to && day > query.to) return false;
    return !query.branchId || lead.branchId === query.branchId;
  });
  const total = leads.length;
  const converted = leads.filter((l) => stageOf(l) === 'converted');
  const lost = leads.filter((l) => stageOf(l) === 'lost');
  const durations = converted
    .map((l) => (Date.parse(l.convertedAt ?? '') - Date.parse(l.createdAt)) / DAY_MS)
    .filter((d) => Number.isFinite(d) && d >= 0);
  const reasons = new Map<string, number>();
  for (const lead of lost) {
    const reason = lead.lostReason?.trim() || 'Belirtilmedi';
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  return {
    from: query.from ?? null,
    to: query.to ?? null,
    total,
    converted: converted.length,
    lost: lost.length,
    open: total - converted.length - lost.length,
    conversionRate: rate(converted.length, total),
    avgDaysToConvert: durations.length ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length) * 10) / 10 : null,
    overdueFollowUps: leads.filter(
      (l) => !['converted', 'lost'].includes(stageOf(l)) && !!l.followUpDate && dayOf(l.followUpDate) < today,
    ).length,
    stages: FUNNEL.map((stage, step) => {
      const reached = leads.filter((l) => reachedStep(l) >= step).length;
      return { stage, current: leads.filter((l) => stageOf(l) === stage).length, reached, rate: rate(reached, total) };
    }),
    bySource: groupBy(leads, (l) => l.source || 'unknown'),
    byStaff: groupBy(leads, (l) => l.assignedStaffName?.trim() || 'unassigned'),
    lostReasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    referrals: leads.filter((l) => !!l.referrerMemberId).length,
  };
}

// ─── Referral programme ───────────────────────────────────────────────────────────────────────

export type ReferralRewardType = 'wallet' | 'days';

export interface ReferralSettings {
  /** Off by default: no reward is given until the gym turns the programme on. */
  enabled: boolean;
  rewardType: ReferralRewardType;
  /** TL credited to the referring member's wallet (rewardType 'wallet'). */
  rewardAmount: number;
  /** Days added to the referring member's active membership (rewardType 'days'). */
  rewardDays: number;
}

export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = { enabled: false, rewardType: 'wallet', rewardAmount: 0, rewardDays: 0 };

export function mergeReferralSettings(stored?: Partial<ReferralSettings> | null): ReferralSettings {
  const merged = { ...DEFAULT_REFERRAL_SETTINGS, ...(stored ?? {}) };
  return {
    enabled: merged.enabled === true,
    rewardType: merged.rewardType === 'days' ? 'days' : 'wallet',
    rewardAmount: Math.max(0, toTl(toKurus(Number(merged.rewardAmount) || 0))),
    rewardDays: Math.max(0, Math.floor(Number(merged.rewardDays) || 0)),
  };
}

export interface ReferrerState {
  walletBalance?: number | null;
  membershipStatus?: string | null;
  membershipEndsAt?: string | null;
}

export type RewardOutcome =
  | { status: 'granted'; type: 'wallet'; amount: number; walletBalance: number }
  | { status: 'granted'; type: 'days'; days: number; membershipEndsAt: string }
  | { status: 'pending'; type: 'days'; days: number; reason: string };

/**
 * What the referring member gets for one new member, or null when the programme is off or the
 * reward is zero. Days are only added to a running membership; otherwise the reward stays
 * pending for staff to apply by hand (the membership end of an expired member means nothing).
 */
export function referralReward(settings: ReferralSettings, referrer: ReferrerState, now = new Date()): RewardOutcome | null {
  if (!settings.enabled) return null;
  if (settings.rewardType === 'wallet') {
    if (settings.rewardAmount <= 0) return null;
    const walletBalance = toTl(toKurus(Number(referrer.walletBalance ?? 0)) + toKurus(settings.rewardAmount));
    return { status: 'granted', type: 'wallet', amount: settings.rewardAmount, walletBalance };
  }
  if (settings.rewardDays <= 0) return null;
  const end = Date.parse(referrer.membershipEndsAt ?? '');
  if (referrer.membershipStatus !== 'active' || !Number.isFinite(end) || end <= now.getTime()) {
    return { status: 'pending', type: 'days', days: settings.rewardDays, reason: 'Tavsiye eden üyenin aktif üyeliği yok' };
  }
  return { status: 'granted', type: 'days', days: settings.rewardDays, membershipEndsAt: new Date(end + settings.rewardDays * DAY_MS).toISOString() };
}

/** One reward per new member, whichever way the referral is recorded. */
export function rewardId(referredMemberId: string) {
  return `member_${referredMemberId}`;
}

import { daysBetween, Installment, planStanding } from '../ops/receivables.math';

export const REMINDER_TYPES = ['membership_expiring', 'installment_overdue', 'inactive_member'] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export interface ReminderTemplate {
  title: string;
  body: string;
}

export interface ReminderSettings {
  /** Master switch for the daily run. */
  enabled: boolean;
  /** Automatic SMS is opt-in per gym; in-app notifications and the staff list always work. */
  smsEnabled: boolean;
  /** Days before the membership end date, largest first (default 7, 3, 1). */
  expiryDays: number[];
  /** Days an installment is late, smallest first (default 1, 7, 14, 30). */
  overdueDays: number[];
  /** A member who has not checked in for this many days is reminded once per absence. */
  inactiveDays: number;
  templates: Record<ReminderType, ReminderTemplate>;
}

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  smsEnabled: false,
  expiryDays: [7, 3, 1],
  overdueDays: [1, 7, 14, 30],
  inactiveDays: 14,
  templates: {
    membership_expiring: {
      title: 'Üyeliğin bitiyor',
      body: 'Merhaba {ad}, {paket} üyeliğinin bitmesine {gun} gün kaldı ({bitis}). Yenilemek için resepsiyona uğrayabilirsin.',
    },
    installment_overdue: {
      title: 'Geciken taksit',
      body: 'Merhaba {ad}, {vade} vadeli {tutar} taksit ödemen {gecikme} gün gecikti. Resepsiyondan ödeyebilirsin.',
    },
    inactive_member: {
      title: 'Seni özledik',
      body: 'Merhaba {ad}, {gun} gündür salona gelmedin. Antrenmanına kaldığın yerden devam etmek için seni bekliyoruz!',
    },
  },
};

export interface ReminderMember {
  uid: string;
  displayName: string;
  phone: string | null;
  membershipStatus: string;
  membershipStartsAt: string | null;
  membershipEndsAt: string | null;
  packageLabel: string | null;
  isArchived?: boolean;
  createdAt?: string;
}

export interface ReminderPlan {
  id: string;
  userId: string;
  memberName: string;
  memberPhone: string | null;
  status: string;
  installments: Installment[];
}

export interface ReminderCandidate {
  /** Deterministic id: the same reminder can never be written twice. */
  key: string;
  type: ReminderType;
  userId: string;
  memberName: string;
  phone: string | null;
  /** Milestone that fired (days left / days late / days absent). */
  milestone: number;
  vars: Record<string, string>;
}

const formatTr = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};
const money = (amount: number) =>
  `₺${amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Picks the milestone whose window contains `value`: thresholds work as ranges so a missed daily
 * run still sends the reminder. For days left [7,3,1]: 7 covers 4–7, 3 covers 2–3, 1 covers 0–1.
 */
export function expiryMilestone(daysLeft: number, milestones: number[]): number | null {
  const sorted = [...new Set(milestones)].filter((m) => m >= 0).sort((a, b) => b - a);
  for (let i = 0; i < sorted.length; i++) {
    const lowerExclusive = sorted[i + 1] ?? -1;
    if (daysLeft <= sorted[i] && daysLeft > lowerExclusive) return sorted[i];
  }
  return null;
}

/** For days late [1,7,14,30]: 1 covers 1–6, 7 covers 7–13, …, 30 covers 30+. */
export function overdueMilestone(daysLate: number, milestones: number[]): number | null {
  const sorted = [...new Set(milestones)].filter((m) => m > 0).sort((a, b) => a - b);
  let hit: number | null = null;
  for (const m of sorted) if (daysLate >= m) hit = m;
  return hit;
}

export function expiringReminders(members: ReminderMember[], today: string, settings: ReminderSettings): ReminderCandidate[] {
  const out: ReminderCandidate[] = [];
  for (const m of members) {
    if (m.isArchived || m.membershipStatus !== 'active' || !m.membershipEndsAt) continue;
    const ends = istanbulDate(m.membershipEndsAt);
    const daysLeft = daysBetween(today, ends);
    const milestone = expiryMilestone(daysLeft, settings.expiryDays);
    if (milestone == null) continue;
    out.push({
      key: `membership_expiring:${m.uid}:${ends}:${milestone}`,
      type: 'membership_expiring',
      userId: m.uid,
      memberName: m.displayName,
      phone: m.phone,
      milestone,
      vars: { ad: firstName(m.displayName), gun: String(daysLeft), paket: m.packageLabel ?? 'paket', bitis: formatTr(ends) },
    });
  }
  return out;
}

export function overdueReminders(plans: ReminderPlan[], today: string, settings: ReminderSettings): ReminderCandidate[] {
  const out: ReminderCandidate[] = [];
  for (const plan of plans) {
    if (plan.status !== 'open') continue;
    for (const item of planStanding(plan.installments, today).installments) {
      if (!item.overdue) continue;
      const milestone = overdueMilestone(item.daysLate, settings.overdueDays);
      if (milestone == null) continue;
      out.push({
        key: `installment_overdue:${plan.id}:${item.no}:${milestone}`,
        type: 'installment_overdue',
        userId: plan.userId,
        memberName: plan.memberName,
        phone: plan.memberPhone,
        milestone,
        vars: {
          ad: firstName(plan.memberName),
          tutar: money(item.remainingAmount),
          vade: formatTr(item.dueDate),
          gecikme: String(item.daysLate),
        },
      });
    }
  }
  return out;
}

/**
 * Active members with no granted check-in during the last `inactiveDays`. `lastReminderAt` holds the
 * previous inactivity reminder per member and `visitedSince` the members who came back after it:
 * one reminder per absence, re-armed once the member visits again.
 */
export function inactiveReminders(
  members: ReminderMember[],
  today: string,
  settings: ReminderSettings,
  recentVisitors: Set<string>,
  lastReminderAt: Map<string, string>,
  visitedSince: Set<string>,
): ReminderCandidate[] {
  const out: ReminderCandidate[] = [];
  const n = settings.inactiveDays;
  if (!n || n < 1) return out;
  for (const m of members) {
    if (m.isArchived || m.membershipStatus !== 'active') continue;
    if (recentVisitors.has(m.uid)) continue;
    const since = m.membershipStartsAt ?? m.createdAt;
    if (since && daysBetween(istanbulDate(since), today) < n) continue; // new member, give them time
    const previous = lastReminderAt.get(m.uid);
    if (previous && !visitedSince.has(m.uid)) continue; // still the same absence
    out.push({
      key: `inactive_member:${m.uid}:${today}`,
      type: 'inactive_member',
      userId: m.uid,
      memberName: m.displayName,
      phone: m.phone,
      milestone: n,
      vars: { ad: firstName(m.displayName), gun: String(n) },
    });
  }
  return out;
}

export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, name: string) => vars[name] ?? all);
}

/** Calendar date of an ISO instant in the gym's time zone. */
export function istanbulDate(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function mergeSettings(stored: Partial<ReminderSettings> | null | undefined): ReminderSettings {
  const base = DEFAULT_REMINDER_SETTINGS;
  return {
    enabled: stored?.enabled ?? base.enabled,
    smsEnabled: stored?.smsEnabled ?? base.smsEnabled,
    expiryDays: stored?.expiryDays?.length ? stored.expiryDays : base.expiryDays,
    overdueDays: stored?.overdueDays?.length ? stored.overdueDays : base.overdueDays,
    inactiveDays: stored?.inactiveDays ?? base.inactiveDays,
    templates: {
      membership_expiring: { ...base.templates.membership_expiring, ...stored?.templates?.membership_expiring },
      installment_overdue: { ...base.templates.installment_overdue, ...stored?.templates?.installment_overdue },
      inactive_member: { ...base.templates.inactive_member, ...stored?.templates?.inactive_member },
    },
  };
}

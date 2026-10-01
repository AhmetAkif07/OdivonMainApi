/**
 * Odivon subscription (SaaS) billing rules, shared by the payment callback, the daily reminder
 * job and the sign-in profile (`/identity/me`), so they all agree on when a gym's access ends.
 */

/** Days a gym keeps full access after its paid period ends, to pay without interruption. */
export const SAAS_GRACE_DAYS = 3;
/** Owner reminders, days before the paid period ends. */
export const SAAS_REMINDER_DAYS = [7, 3, 1] as const;

export type SaasCycle = 'monthly' | 'yearly';

const DAY_MS = 86_400_000;

/** Adds calendar months (UTC), clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(from: Date, months: number): Date {
  const target = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months, 1, from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds()));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(from.getUTCDate(), lastDay));
  return target;
}

/**
 * The period a payment buys: it starts when the current paid period ends (early renewal loses
 * nothing) or now, whichever is later.
 */
export function nextPeriod(currentEnd: string | null | undefined, cycle: SaasCycle, now = new Date()) {
  const end = Date.parse(currentEnd ?? '');
  const start = Number.isFinite(end) && end > now.getTime() ? new Date(end) : now;
  return { startsAt: start.toISOString(), endsAt: addMonths(start, cycle === 'yearly' ? 12 : 1).toISOString() };
}

export interface TenantBillingState {
  membershipStatus?: string | null;
  trialEndsAt?: string | null;
  subscriptionEndsAt?: string | null;
}

/**
 * Status the panel gates on. A paid gym stays `active` through the grace period after its end
 * date and becomes `expired` afterwards; trials keep their own end date.
 */
export function effectiveSubscription(tenant: TenantBillingState, now = new Date()) {
  const status = tenant.membershipStatus ?? 'active';
  const end = Date.parse(tenant.subscriptionEndsAt ?? '');
  if (status !== 'active' || !Number.isFinite(end)) {
    return { membershipStatus: status, subscriptionEndsAt: tenant.subscriptionEndsAt ?? null, graceEndsAt: null, inGrace: false };
  }
  const graceEnd = end + SAAS_GRACE_DAYS * DAY_MS;
  return {
    membershipStatus: now.getTime() > graceEnd ? 'expired' : 'active',
    subscriptionEndsAt: tenant.subscriptionEndsAt!,
    graceEndsAt: new Date(graceEnd).toISOString(),
    inGrace: now.getTime() > end && now.getTime() <= graceEnd,
  };
}

/** Whole days from `day` (gym-local yyyy-mm-dd) until the end instant, counted by calendar day. */
export function daysUntil(endIso: string, day: string): number {
  const endDay = new Date(Date.parse(endIso) + 3 * 3_600_000).toISOString().slice(0, 10); // Istanbul
  return Math.round((Date.parse(`${endDay}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);
}

/** Receipt number shown to the gym: date + the start of the payment session id. */
export function receiptNo(sessionId: string, paidAt: string): string {
  return `ODV-${paidAt.slice(0, 10).replace(/-/g, '')}-${sessionId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

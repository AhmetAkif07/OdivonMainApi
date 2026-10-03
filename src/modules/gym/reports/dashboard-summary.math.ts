import { AccessEvent, eventTime, localParts } from './reports.math';

const DAY_MS = 86_400_000;

/** Gym-local day of an ISO time; empty for a missing or broken value. */
export const safeDay = (iso: unknown): string =>
  iso && !Number.isNaN(Date.parse(String(iso))) ? localParts(String(iso)).day : '';

export const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** The `count` gym-local days ending with `today`, oldest first. */
export function lastDays(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(today, i - (count - 1)));
}

const passedIn = (event: AccessEvent) => (event.status === 'granted' || event.status === 'unknown') && event.direction !== 'out';

export function checkInsByDay(events: AccessEvent[], days: string[]) {
  const counts = new Map(days.map((day) => [day, 0]));
  for (const event of events) {
    if (!passedIn(event)) continue;
    const day = safeDay(eventTime(event));
    if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return days.map((day) => ({ day, count: counts.get(day) ?? 0 }));
}

export interface SummarySale {
  totalAmount?: number | string | null;
  saleDate?: string | null;
  createdAt?: string | null;
  status?: string | null;
}

export function salesByDay(sales: SummarySale[], days: string[]) {
  const totals = new Map(days.map((day) => [day, { amount: 0, count: 0 }]));
  for (const sale of sales) {
    if (sale.status === 'refunded') continue;
    const bucket = totals.get(safeDay(sale.saleDate || sale.createdAt));
    if (!bucket) continue;
    bucket.amount += Number(sale.totalAmount ?? 0) || 0;
    bucket.count += 1;
  }
  return days.map((day) => {
    const bucket = totals.get(day) ?? { amount: 0, count: 0 };
    return { day, amount: Math.round(bucket.amount * 100) / 100, count: bucket.count };
  });
}

export interface SummaryMember {
  membershipStatus?: string | null;
  membershipEndsAt?: string | null;
  isArchived?: boolean | null;
}

/** Members by state now; an "active" membership whose end date passed counts as expired. */
export function memberStatus(members: SummaryMember[], now: Date) {
  const result = { active: 0, expiringSoon: 0, expired: 0, trial: 0, cancelled: 0 };
  for (const member of members) {
    if (member.isArchived) continue;
    const end = member.membershipEndsAt ? Date.parse(member.membershipEndsAt) : Number.NaN;
    if (member.membershipStatus === 'active') {
      if (!Number.isNaN(end) && end < now.getTime()) result.expired += 1;
      else if (!Number.isNaN(end) && end - now.getTime() <= 7 * DAY_MS) result.expiringSoon += 1;
      else result.active += 1;
    } else if (member.membershipStatus === 'trial') result.trial += 1;
    else if (member.membershipStatus === 'cancelled') result.cancelled += 1;
    else result.expired += 1;
  }
  return result;
}

export interface SummaryEntry {
  type?: string | null;
  amount?: number | string | null;
  entryDate?: string | null;
  createdAt?: string | null;
}

export function financeByMonth(entries: SummaryEntry[], months: string[]) {
  const totals = new Map(months.map((month) => [month, { income: 0, expense: 0 }]));
  for (const entry of entries) {
    const amount = Number(entry.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const bucket = totals.get(safeDay(entry.entryDate || entry.createdAt).slice(0, 7));
    if (!bucket) continue;
    if (String(entry.type ?? 'income').toLowerCase() === 'expense') bucket.expense += amount;
    else bucket.income += amount;
  }
  return months.map((month) => {
    const bucket = totals.get(month) ?? { income: 0, expense: 0 };
    return { month, income: Math.round(bucket.income * 100) / 100, expense: Math.round(bucket.expense * 100) / 100 };
  });
}

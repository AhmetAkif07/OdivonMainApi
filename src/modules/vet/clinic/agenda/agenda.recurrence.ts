import { AgendaRecurrence } from './agenda.entity';

const DAY_MS = 86_400_000;
/** Hard cap on occurrences per series (also for count). */
export const MAX_OCCURRENCES = 366;
/** Open-ended series are kept materialized this far ahead. */
export const OPEN_HORIZON_DAYS = 365;
/** Top up an open-ended series when its last occurrence is closer than this. */
export const TOP_UP_THRESHOLD_DAYS = 180;
/** Türkiye (UTC+3, no DST) when the client does not send its offset. */
export const DEFAULT_UTC_OFFSET_MINUTES = 180;

export interface Occurrence {
  index: number;
  dueAt: string;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** Same day of month (clamped to the month's last day) `months` after `start`, same time. */
function addMonthsClamped(start: Date, months: number): Date {
  const total = start.getUTCMonth() + months;
  const year = start.getUTCFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate(), daysInMonth(year, month));
  return new Date(
    Date.UTC(year, month, day, start.getUTCHours(), start.getUTCMinutes(), start.getUTCSeconds(), start.getUTCMilliseconds()),
  );
}

/**
 * The n-th date of the series, in order, starting from `startAt` (index 0 = the start itself,
 * or for weekly-with-weekdays the first selected weekday on/after the start). Deterministic, so a
 * series can be extended later from its highest index.
 */
function* sequence(startAt: string, rule: AgendaRecurrence): Generator<Date> {
  const start = new Date(startAt);
  const interval = Math.max(1, Math.floor(rule.interval || 1));
  if (rule.frequency === 'weekly' && rule.weekdays?.length) {
    // Rule uses 0 = Sunday; walk Monday-based weeks so Sunday comes last.
    const offsets = [...new Set(rule.weekdays.map((weekday) => (weekday + 6) % 7))].sort((a, b) => a - b);
    const startDow = (start.getUTCDay() + 6) % 7;
    const weekStart = start.getTime() - startDow * DAY_MS;
    for (let week = 0; ; week += interval) {
      for (const offset of offsets) {
        const date = new Date(weekStart + (week * 7 + offset) * DAY_MS);
        if (date.getTime() >= start.getTime()) yield date;
      }
    }
  }
  for (let step = 0; ; step++) {
    switch (rule.frequency) {
      case 'daily':
        yield new Date(start.getTime() + step * interval * DAY_MS);
        break;
      case 'weekly':
        yield new Date(start.getTime() + step * interval * 7 * DAY_MS);
        break;
      case 'monthly':
        yield addMonthsClamped(start, step * interval);
        break;
      case 'yearly':
        yield addMonthsClamped(start, step * interval * 12);
        break;
    }
  }
}

/**
 * Occurrences with index >= `fromIndex`, up to the rule's end (count/until) or `horizon` for an
 * open-ended rule, never more than MAX_OCCURRENCES in total.
 */
export function occurrences(startAt: string, rule: AgendaRecurrence, fromIndex = 0, horizon?: Date): Occurrence[] {
  // Weekdays and month days follow the clinic's wall clock, so walk the series in local time.
  const shift = (rule.utcOffsetMinutes ?? DEFAULT_UTC_OFFSET_MINUTES) * 60_000;
  const localStart = new Date(new Date(startAt).getTime() + shift).toISOString();
  const limit = Math.min(rule.count ?? MAX_OCCURRENCES, MAX_OCCURRENCES);
  const until = rule.until ? new Date(new Date(`${rule.until.slice(0, 10)}T23:59:59.999Z`).getTime() - shift) : null;
  const end = until ?? horizon ?? new Date(Date.now() + OPEN_HORIZON_DAYS * DAY_MS);
  const result: Occurrence[] = [];
  let index = 0;
  for (const local of sequence(localStart, rule)) {
    const date = new Date(local.getTime() - shift);
    if (index >= limit || date.getTime() > end.getTime()) break;
    if (index >= fromIndex) result.push({ index, dueAt: date.toISOString() });
    index++;
  }
  return result;
}

export function isOpenEnded(rule: AgendaRecurrence): boolean {
  return !rule.until && !rule.count;
}

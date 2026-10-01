/**
 * Classes are weekly slots (`dayOfWeek` 0 = Sunday … 6 = Saturday, `startTime` HH:mm, Istanbul
 * time). A booking is for one occurrence of the slot: its `sessionDate` (YYYY-MM-DD).
 */

/** Istanbul has had no DST since 2016. */
const OFFSET = '+03:00';
const DAY_MS = 86_400_000;

/** Cancelling at least this long before the start refunds the class credit. */
export const LATE_CANCEL_HOURS = 2;

export function sessionStart(sessionDate: string, startTime: string): Date {
  const time = /^\d{1,2}:\d{2}$/.test(startTime) ? startTime.padStart(5, '0') : '00:00';
  return new Date(`${sessionDate}T${time}:00${OFFSET}`);
}

/** Weekday (0 = Sunday) of a gym-local calendar date. */
export function weekdayOf(sessionDate: string): number {
  return new Date(`${sessionDate}T12:00:00${OFFSET}`).getUTCDay();
}

function localDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** The next occurrence of the slot that has not started yet. */
export function nextSessionDate(dayOfWeek: number, startTime: string, now = new Date()): string {
  const today = localDate(now);
  for (let i = 0; i <= 7; i++) {
    const date = localDate(new Date(Date.parse(`${today}T12:00:00${OFFSET}`) + i * DAY_MS));
    if (weekdayOf(date) === dayOfWeek && sessionStart(date, startTime).getTime() > now.getTime()) return date;
  }
  return localDate(new Date(Date.parse(`${today}T12:00:00${OFFSET}`) + 7 * DAY_MS));
}

/** A booking cancelled at least LATE_CANCEL_HOURS before the start gets its credit back. */
export function isTimelyCancel(sessionDate: string, startTime: string, now = new Date()): boolean {
  return sessionStart(sessionDate, startTime).getTime() - now.getTime() >= LATE_CANCEL_HOURS * 3_600_000;
}

/** Credits left, or null when the member's package has unlimited classes. */
export function creditsLeft(member: { classCreditsTotal?: number | null; classCreditsUsed?: number | null }): number | null {
  if (member.classCreditsTotal == null) return null;
  return Math.max(0, member.classCreditsTotal - (member.classCreditsUsed ?? 0));
}

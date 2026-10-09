export const DEFAULT_TIMEZONE = 'Europe/Istanbul';

export interface TenantSchedule {
  timeZone: string;
  workDayStart?: string; // "09:00"
  workDayEnd?: string; // "21:00"
}

/** Offset (ms) of `timeZone` relative to UTC at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** [start, end) instants of a local calendar day (`YYYY-MM-DD`) in `timeZone`. */
export function dayBoundsInTz(dateStr: string, timeZone: string): { start: Date; end: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d);
  const start = new Date(localMidnightAsUtc - tzOffsetMs(new Date(localMidnightAsUtc), timeZone));
  const nextMidnightAsUtc = Date.UTC(y, m - 1, d + 1);
  const end = new Date(nextMidnightAsUtc - tzOffsetMs(new Date(nextMidnightAsUtc), timeZone));
  return { start, end };
}

/** `YYYY-MM-DD` of `now` in `timeZone` — the id of the cash register day money written now belongs to. */
export function dateIdInTz(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** `YYYYMMDD` for "now" in `timeZone` (used in receipt numbers). */
export function dateStampInTz(timeZone: string, now = new Date()): string {
  return dateIdInTz(timeZone, now).replace(/-/g, '');
}

/** Local calendar day (`YYYY-MM-DD`) and minutes since local midnight of `instant` in `timeZone`. */
export function localClockInTz(
  instant: Date,
  timeZone: string,
): { dateId: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    dateId: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** "HH:MM" → minutes since midnight; undefined for a missing or malformed value. */
export function parseClock(value: string | undefined): number | undefined {
  const match = value?.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes <= 24 * 60 ? minutes : undefined;
}

/** Null when [start, end) fits inside the tenant's working hours on one local day, else a reason. */
export function workHoursViolation(
  start: Date,
  end: Date,
  schedule: TenantSchedule,
): string | null {
  const open = parseClock(schedule.workDayStart);
  const close = parseClock(schedule.workDayEnd);
  if (open === undefined || close === undefined) return null;
  const s = localClockInTz(start, schedule.timeZone);
  const e = localClockInTz(new Date(end.getTime() - 1), schedule.timeZone);
  if (s.dateId !== e.dateId || s.minutes < open || e.minutes + 1 > close) {
    return `Randevu çalışma saatleri (${schedule.workDayStart}–${schedule.workDayEnd}) dışında kalıyor.`;
  }
  return null;
}

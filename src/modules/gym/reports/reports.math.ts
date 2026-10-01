const TZ = 'Europe/Istanbul';
const DAY_MS = 86_400_000;

/** One turnstile event, as stored in gymAccessLogs. */
export interface AccessEvent {
  userId?: string | null;
  direction?: string | null;
  status?: string | null;
  timestamp?: string | null;
  createdAt?: string | null;
}

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
  weekday: 'short',
});
const WEEKDAY: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

/** Gym-local calendar day, weekday (0 = Monday) and hour of an instant. */
export function localParts(iso: string): { day: string; weekday: number; hour: number } {
  const p = Object.fromEntries(parts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { day: `${p['year']}-${p['month']}-${p['day']}`, weekday: WEEKDAY[p['weekday']] ?? 0, hour: Number(p['hour']) % 24 };
}

export const eventTime = (e: AccessEvent) => String(e.timestamp ?? e.createdAt ?? '');
/** The device let the person through ("unknown" = the device did not report a result, but a passage happened). */
const passed = (e: AccessEvent) => e.status === 'granted' || e.status === 'unknown';
const isEntry = (e: AccessEvent) => passed(e) && e.direction !== 'out';
const isExit = (e: AccessEvent) => passed(e) && e.direction === 'out';

export interface OccupancyNow {
  inside: number;
  todayEntries: number;
  todayExits: number;
  /** `exits`: gates record exits, so inside = people whose last event today is an entry.
   *  `estimate`: no exits recorded today, so inside = people who entered in the last `stayMinutes`. */
  method: 'exits' | 'estimate';
  stayMinutes: number;
}

/** People currently inside, from today's events only. */
export function occupancyNow(todayEvents: AccessEvent[], now: Date, stayMinutes = 90): OccupancyNow {
  const entries = todayEvents.filter(isEntry);
  const exits = todayEvents.filter(isExit);
  if (exits.length > 0) {
    const last = new Map<string, AccessEvent>();
    let anonymousBalance = 0;
    for (const e of [...entries, ...exits].sort((a, b) => eventTime(a).localeCompare(eventTime(b)))) {
      if (e.userId) last.set(e.userId, e);
      else anonymousBalance += isEntry(e) ? 1 : -1;
    }
    const insideKnown = [...last.values()].filter(isEntry).length;
    return {
      inside: Math.max(0, insideKnown + anonymousBalance),
      todayEntries: entries.length,
      todayExits: exits.length,
      method: 'exits',
      stayMinutes,
    };
  }
  const since = new Date(now.getTime() - stayMinutes * 60_000).toISOString();
  const recent = entries.filter((e) => eventTime(e) >= since);
  const people = new Set(recent.map((e, i) => e.userId ?? `anon-${i}`));
  return { inside: people.size, todayEntries: entries.length, todayExits: 0, method: 'estimate', stayMinutes };
}

export interface HourlyOccupancy {
  from: string;
  to: string;
  days: number;
  totalEntries: number;
  /** Average entries per weekday (0 = Monday) and hour, over the weekdays that occurred in range. */
  averages: number[][];
  /** Average entries per hour across all days. */
  hourly: number[];
  peak: { weekday: number; hour: number; average: number } | null;
  quietest: { weekday: number; hour: number; average: number } | null;
}

/** Entries per weekday × hour between `from` and `to` (gym-local days, inclusive). */
export function hourlyOccupancy(events: AccessEvent[], from: string, to: string, openHours?: [number, number]): HourlyOccupancy {
  const counts = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  const weekdayDays = new Array<number>(7).fill(0);
  let days = 0;
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += DAY_MS) {
    weekdayDays[localParts(new Date(t).toISOString()).weekday] += 1;
    days += 1;
  }
  let totalEntries = 0;
  for (const e of events) {
    if (!isEntry(e)) continue;
    const at = eventTime(e);
    if (!at) continue;
    const p = localParts(at);
    if (p.day < from || p.day > to) continue;
    counts[p.weekday][p.hour] += 1;
    totalEntries += 1;
  }
  const round = (n: number) => Math.round(n * 10) / 10;
  const averages = counts.map((row, wd) => row.map((c) => (weekdayDays[wd] ? round(c / weekdayDays[wd]) : 0)));
  const hourly = Array.from({ length: 24 }, (_, h) => round(days ? counts.reduce((s, row) => s + row[h], 0) / days : 0));
  const [open, close] = openHours ?? [0, 24];
  let peak: HourlyOccupancy['peak'] = null;
  let quietest: HourlyOccupancy['quietest'] = null;
  averages.forEach((row, weekday) =>
    row.forEach((average, hour) => {
      if (!weekdayDays[weekday]) return;
      if (!peak || average > peak.average) peak = { weekday, hour, average };
      if (hour >= open && hour < close && (!quietest || average < quietest.average)) quietest = { weekday, hour, average };
    }),
  );
  return { from, to, days, totalEntries, averages, hourly, peak: totalEntries ? peak : null, quietest: totalEntries ? quietest : null };
}

/** The member fields churn needs. */
export interface ChurnMember {
  uid: string;
  displayName: string;
  phone: string | null;
  packageLabel: string | null;
  membershipStatus: string;
  membershipStartsAt: string | null;
  membershipEndsAt: string | null;
  createdAt: string;
  isArchived?: boolean;
}

export interface ChurnMonth {
  month: string;
  /** Memberships that came to an end (or were renewed) in the month. */
  dueCount: number;
  renewedCount: number;
  churnedCount: number;
  /** churned / due, 0–100 (null when nothing was due). */
  churnRate: number | null;
  churned: { uid: string; displayName: string; phone: string | null; packageLabel: string | null; endedAt: string }[];
}

/**
 * Churn per month: share of memberships that ended in the month and were not renewed.
 *
 * Member records keep only the current period, so a renewal is recognised by its new start
 * date: a member created before the month whose period started inside it renewed (the previous
 * period ended around then). A member whose current period ended inside the month, in the past,
 * churned (frozen memberships are excluded).
 */
export function churnByMonth(members: ChurnMember[], months: string[], now: Date): ChurnMonth[] {
  const nowIso = now.toISOString();
  return months.map((month) => {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1) - 3 * 3_600_000).toISOString(); // Istanbul midnight
    const end = new Date(Date.UTC(y, m, 1) - 3 * 3_600_000).toISOString();
    const churned: ChurnMonth['churned'] = [];
    let renewed = 0;
    for (const member of members) {
      if (member.isArchived) continue;
      const ends = member.membershipEndsAt ?? '';
      const starts = member.membershipStartsAt ?? '';
      // A renewal moves the end date forward, so a past end date inside the month means "not
      // renewed" (the stored status may still say active: it is not updated when the date passes).
      if (ends >= start && ends < end && ends <= nowIso && member.membershipStatus !== 'frozen') {
        churned.push({ uid: member.uid, displayName: member.displayName, phone: member.phone, packageLabel: member.packageLabel, endedAt: ends });
      } else if (starts >= start && starts < end && member.createdAt < start) {
        renewed += 1;
      }
    }
    const due = churned.length + renewed;
    return {
      month,
      dueCount: due,
      renewedCount: renewed,
      churnedCount: churned.length,
      churnRate: due ? Math.round((churned.length / due) * 1000) / 10 : null,
      churned: churned.sort((a, b) => a.endedAt.localeCompare(b.endedAt)),
    };
  });
}

/** The last `count` gym-local months ending with the month of `today` (`YYYY-MM`, oldest first). */
export function lastMonths(today: string, count: number): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

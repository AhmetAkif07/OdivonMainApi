/**
 * "Is the member in the gym?" from turnstile events. One small document per member
 * (`gymPresence/{uid}`) holds the last entry and exit, so the member app and the trainer's floor
 * list read one document instead of the access log.
 */

/** Türkiye time (UTC+3, no DST): the gym's "today". */
export const TR_OFFSET_MS = 3 * 3_600_000;
/** Many gyms have no exit reader: after this long an entry no longer counts as "inside". */
export const INSIDE_MAX_MS = 4 * 3_600_000;
/** An event older than this was buffered by an offline device; greeting the member now is wrong. */
export const WELCOME_FRESH_MS = 10 * 60_000;
/** One greeting per visit, even when the card is read again at an inner door. */
export const WELCOME_GAP_MS = 3 * 3_600_000;

/** The part of an access log the presence rules need. */
export interface AccessSignal {
  userId: string | null;
  status: string;
  direction: string;
  gateName: string;
  timestamp: string;
}

export interface PresenceState {
  lastInAt: string | null;
  lastOutAt: string | null;
  gateName: string | null;
  /** Newest event applied; older ones arriving late are ignored. */
  lastEventAt: string | null;
  lastWelcomeAt: string | null;
}

type Raw = Record<string, unknown>;

const EMPTY: PresenceState = { lastInAt: null, lastOutAt: null, gateName: null, lastEventAt: null, lastWelcomeAt: null };

function ms(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/** UTC instant of 00:00 Türkiye time on the day `now` falls in. */
export function startOfDayTr(now: number): number {
  const local = new Date(now + TR_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - TR_OFFSET_MS;
}

/** "18:42" in Türkiye time. */
export function clockTr(iso: string): string {
  const at = ms(iso);
  if (at === null) return '';
  const local = new Date(at + TR_OFFSET_MS);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Applies new events of one member (any order) to their presence.
 * `next` is null when nothing changed; `welcome` is the entry the member should be greeted for.
 * Anything that is not an explicit exit counts as an entry, like the visit counters do.
 */
export function reducePresence(
  current: PresenceState | null,
  events: AccessSignal[],
  now: number,
): { next: PresenceState | null; welcome: AccessSignal | null } {
  const state: PresenceState = { ...EMPTY, ...(current ?? {}) };
  let changed = false;
  let welcome: AccessSignal | null = null;
  const granted = events
    .filter((event) => event.status === 'granted' && ms(event.timestamp) !== null)
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  for (const event of granted) {
    if (state.lastEventAt && event.timestamp < state.lastEventAt) continue;
    changed = true;
    state.lastEventAt = event.timestamp;
    if (event.direction === 'out') {
      state.lastOutAt = event.timestamp;
      continue;
    }
    state.lastInAt = event.timestamp;
    state.gateName = event.gateName || state.gateName;
    const at = ms(event.timestamp)!;
    const lastWelcome = ms(state.lastWelcomeAt);
    if (Math.abs(now - at) <= WELCOME_FRESH_MS && (lastWelcome === null || now - lastWelcome >= WELCOME_GAP_MS)) {
      state.lastWelcomeAt = new Date(now).toISOString();
      welcome = event;
    }
  }
  return { next: changed ? state : null, welcome };
}

export function presenceView(state: PresenceState | null, now: number) {
  const lastIn = ms(state?.lastInAt);
  const lastOut = ms(state?.lastOutAt);
  return {
    inside: lastIn !== null && (lastOut === null || lastIn > lastOut) && now - lastIn < INSIDE_MAX_MS,
    today: lastIn !== null && lastIn >= startOfDayTr(now),
    lastInAt: state?.lastInAt ?? null,
    lastOutAt: state?.lastOutAt ?? null,
    gateName: state?.gateName ?? null,
  };
}

/** Presence of a member who has no presence document yet, from their own access-log documents. */
export function presenceFromLogs(logs: Raw[]): PresenceState {
  const at = (item: Raw) => String(item['timestamp'] ?? item['createdAt'] ?? '');
  const granted = logs.filter((item) => item['status'] === 'granted').sort((left, right) => at(right).localeCompare(at(left)));
  const lastIn = granted.find((item) => item['direction'] !== 'out');
  const lastOut = granted.find((item) => item['direction'] === 'out');
  return {
    lastInAt: lastIn ? at(lastIn) : null,
    lastOutAt: lastOut ? at(lastOut) : null,
    gateName: lastIn ? String(lastIn['gateName'] ?? '') || null : null,
    lastEventAt: granted[0] ? at(granted[0]) : null,
    lastWelcomeAt: null,
  };
}

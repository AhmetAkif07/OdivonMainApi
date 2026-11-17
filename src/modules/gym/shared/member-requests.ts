/**
 * What a member can ask the gym's trainers for. Requests live in `gymProgramRequests`
 * (the collection predates the other kinds); a document without `type` is a program request.
 */

export const REQUEST_TYPES = ['program', 'program_change', 'floor_help', 'measurement'] as const;
export type MemberRequestType = (typeof REQUEST_TYPES)[number];

export type MemberRequestStatus = 'pending' | 'accepted' | 'fulfilled' | 'rejected' | 'cancelled' | 'expired';
export type RequestAction = 'accept' | 'fulfill' | 'reject' | 'cancel';

/** A call for help on the gym floor is only meaningful for a short while. */
export const FLOOR_HELP_TTL_MS = 30 * 60_000;

export const REQUEST_LABELS: Record<MemberRequestType, string> = {
  program: 'Program isteği',
  program_change: 'Program değişikliği',
  floor_help: 'Salonda yardım',
  measurement: 'Ölçüm isteği',
};

type Raw = Record<string, unknown>;

export function requestType(item: Raw): MemberRequestType {
  const type = item['type'];
  return REQUEST_TYPES.includes(type as MemberRequestType) ? (type as MemberRequestType) : 'program';
}

/** Stored status, except that an unanswered or unfinished floor call lapses on its own. */
export function requestStatus(item: Raw, now = Date.now()): MemberRequestStatus {
  const stored = String(item['status'] ?? 'pending') as MemberRequestStatus;
  if (requestType(item) !== 'floor_help' || (stored !== 'pending' && stored !== 'accepted')) return stored;
  const last = new Date(String(item['acceptedAt'] ?? item['createdAt'] ?? '')).getTime();
  return !Number.isNaN(last) && now - last > FLOOR_HELP_TTL_MS ? 'expired' : stored;
}

export function isOpenRequest(item: Raw, now = Date.now()): boolean {
  const status = requestStatus(item, now);
  return status === 'pending' || status === 'accepted';
}

/** The status an action leads to, or null when the request is no longer open for it. */
export function nextRequestStatus(current: MemberRequestStatus, action: RequestAction): MemberRequestStatus | null {
  if (current !== 'pending' && current !== 'accepted') return null;
  if (action === 'accept') return current === 'pending' ? 'accepted' : null;
  if (action === 'fulfill') return 'fulfilled';
  if (action === 'reject') return 'rejected';
  return 'cancelled';
}

/**
 * A trainer sees the requests of their own members, the ones nobody is assigned to, and every
 * call for help on the floor (whoever is closest answers it).
 */
export function visibleToTrainer(item: Raw, trainerIds: readonly string[]): boolean {
  const trainerId = item['trainerId'];
  if (!trainerId) return true;
  if (requestType(item) === 'floor_help') return true;
  return trainerIds.includes(String(trainerId));
}

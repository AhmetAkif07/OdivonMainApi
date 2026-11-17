import { isOpenRequest, requestType } from '../shared/member-requests';
import { PlanProgress } from '../shared/plan-progress';

/**
 * Pure rules of the trainer's screens: which badges a member gets on the floor list and in what
 * order the trainer sees them. Kept apart from Firestore so they are easy to test.
 */

type Raw = Record<string, unknown>;

/** Membership ending within this many days is worth a word from the trainer. */
export const MEMBERSHIP_ENDING_DAYS = 7;
const DAY_MS = 86_400_000;

export type CoachFlag =
  /** Asked for help on the floor and nobody closed it yet. */
  | 'help'
  /** Has a workout running right now (live snapshot is fresh). */
  | 'live'
  /** Has any other open request (program, change, measurement). */
  | 'request'
  /** No active program at all. */
  | 'no_program'
  /** Active program reached its target or its period ended. */
  | 'program_done'
  /** Behind the pace of the program's period. */
  | 'behind'
  | 'membership_ending';

export interface FlagInput {
  requests: Raw[];
  live: boolean;
  activePlanProgress: PlanProgress[];
  membershipEndsAt: string | null;
  now: number;
}

export function coachFlags(input: FlagInput): CoachFlag[] {
  const flags: CoachFlag[] = [];
  const open = input.requests.filter((item) => isOpenRequest(item, input.now));
  if (open.some((item) => requestType(item) === 'floor_help')) flags.push('help');
  if (input.live) flags.push('live');
  if (open.some((item) => requestType(item) !== 'floor_help')) flags.push('request');
  if (!input.activePlanProgress.length) {
    flags.push('no_program');
  } else if (input.activePlanProgress.every((p) => p.state === 'target_reached' || p.state === 'period_over')) {
    flags.push('program_done');
  } else if (input.activePlanProgress.some((p) => p.state === 'behind')) {
    flags.push('behind');
  }
  const ends = input.membershipEndsAt ? new Date(input.membershipEndsAt).getTime() : NaN;
  if (!Number.isNaN(ends) && ends >= input.now && ends - input.now <= MEMBERSHIP_ENDING_DAYS * DAY_MS) {
    flags.push('membership_ending');
  }
  return flags;
}

/** The trainer's own member: `trainerId` holds either their staff record id or their sign-in uid. */
export function isMine(member: { trainerId?: string | null }, trainerIds: readonly string[]): boolean {
  return Boolean(member.trainerId) && trainerIds.includes(String(member.trainerId));
}

export interface FloorSortable {
  flags: CoachFlag[];
  mine: boolean;
  inside: boolean;
  lastInAt: string | null;
}

/** Help calls first, then live workouts, then the trainer's own members; newest arrival first. */
export function compareFloor(left: FloorSortable, right: FloorSortable): number {
  const rank = (row: FloorSortable) =>
    (row.flags.includes('help') ? 0 : row.flags.includes('live') ? 1 : 2) * 4 + (row.inside ? 0 : 2) + (row.mine ? 0 : 1);
  return rank(left) - rank(right) || String(right.lastInAt ?? '').localeCompare(String(left.lastInAt ?? ''));
}

/** Granted entries (anything but an explicit exit) in the current Türkiye calendar month. */
export function visitsThisMonthTr(logs: Raw[], now: number): number {
  const local = new Date(now + 3 * 3_600_000);
  const month = `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
  return logs.filter((item) => {
    if (item['status'] !== 'granted' || item['direction'] === 'out') return false;
    const at = new Date(String(item['timestamp'] ?? item['createdAt'] ?? '')).getTime();
    if (Number.isNaN(at)) return false;
    const day = new Date(at + 3 * 3_600_000);
    return `${day.getUTCFullYear()}-${String(day.getUTCMonth() + 1).padStart(2, '0')}` === month;
  }).length;
}

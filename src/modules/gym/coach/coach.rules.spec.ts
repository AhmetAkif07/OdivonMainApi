import { buildLiveSession, liveSummary, liveView, LIVE_STALE_MS } from '../shared/live-session';
import { FLOOR_HELP_TTL_MS, isOpenRequest, nextRequestStatus, requestStatus, requestType, visibleToTrainer } from '../shared/member-requests';
import { planPeriodPatch, planProgress, readPlanStats, statsFromSessions } from '../shared/plan-progress';
import { INSIDE_MAX_MS, presenceFromLogs, presenceView, reducePresence, startOfDayTr, WELCOME_FRESH_MS } from '../signals/presence.rules';
import { coachFlags, compareFloor, isMine, visitsThisMonthTr } from './coach.rules';

const WEEK = 7 * 86_400_000;
const start = Date.parse('2026-11-02T06:00:00.000Z');
const days = [
  { id: 'd1', name: 'İtiş', order: 1, exercises: [] },
  { id: 'd2', name: 'Çekiş', order: 2, exercises: [] },
  { id: 'd3', name: 'Bacak', order: 3, exercises: [] },
];
const plan = (extra: Record<string, unknown> = {}) =>
  ({ id: 'p1', createdAt: '2026-11-02T06:00:00.000Z', startDate: '2026-11-02T06:00:00.000Z', days, ...extra }) as never;
const stats = (completedSessions: number, lastDayId: string | null = null) => ({ completedSessions, lastSessionAt: null, lastDayId });

describe('planProgress', () => {
  it('is open-ended without a period, but still knows the next day and the cycle', () => {
    const progress = planProgress(plan(), stats(4, 'd1'), start + WEEK);
    expect(progress).toMatchObject({ state: 'open', targetSessions: null, percent: null, cycle: 2, cycleDone: 1, nextDayId: 'd2' });
  });

  it('counts weeks × days per week as the target and reports the week', () => {
    const progress = planProgress(plan({ durationWeeks: 8, targetDaysPerWeek: 3 }), stats(9, 'd3'), start + 3.5 * WEEK);
    expect(progress).toMatchObject({ targetSessions: 24, completedSessions: 9, percent: 38, week: 4, state: 'on_track', nextDayId: 'd1' });
    expect(progress.endsAt).toBe(new Date(start + 8 * WEEK).toISOString());
  });

  it('falls back to the number of plan days when days per week is not set', () => {
    expect(planProgress(plan({ durationWeeks: 4 }), stats(0), start).targetSessions).toBe(12);
  });

  it('marks a member more than a week of workouts behind the pace', () => {
    expect(planProgress(plan({ durationWeeks: 8, targetDaysPerWeek: 3 }), stats(2), start + 3 * WEEK).state).toBe('behind');
  });

  it('reaches the target, or runs out of time, without closing the plan', () => {
    const done = planProgress(plan({ durationWeeks: 2, targetDaysPerWeek: 3, status: 'active' }), stats(7), start + WEEK);
    expect(done).toMatchObject({ state: 'target_reached', percent: 100 });
    expect(planProgress(plan({ durationWeeks: 2, targetDaysPerWeek: 3 }), stats(3), start + 3 * WEEK).state).toBe('period_over');
  });
});

describe('plan period and counters', () => {
  it('writes the end date from the start and clears it with 0 weeks', () => {
    expect(planPeriodPatch({ durationWeeks: 8, targetDaysPerWeek: 3, startDate: '2026-11-02T00:00:00.000Z' })).toEqual({
      durationWeeks: 8,
      targetDaysPerWeek: 3,
      endDate: '2026-12-28T00:00:00.000Z',
    });
    expect(planPeriodPatch({ durationWeeks: 0 })).toEqual({ durationWeeks: null, endDate: null });
  });

  it('moves the end date when only the start moves, and leaves the period alone otherwise', () => {
    const current = { durationWeeks: 4, startDate: '2026-11-02T00:00:00.000Z' };
    expect(planPeriodPatch({ startDate: '2026-11-09T00:00:00.000Z' }, current)).toEqual({ endDate: '2026-12-07T00:00:00.000Z' });
    expect(planPeriodPatch({}, current)).toEqual({});
  });

  it('counts only completed sessions of the plan and remembers the last trained day', () => {
    const sessions = [
      { id: 's1', planId: 'p1', status: 'completed', completedAt: '2026-11-03T10:00:00Z', dayId: 'd1' },
      { id: 's2', planId: 'p1', status: 'completed', completedAt: '2026-11-05T10:00:00Z', dayId: 'd2' },
      { id: 's3', planId: 'p1', status: 'active' },
      { id: 's4', planId: 'p2', status: 'completed', completedAt: '2026-11-06T10:00:00Z', dayId: 'x' },
    ] as never[];
    expect(statsFromSessions('p1', sessions)).toEqual({ completedSessions: 2, lastSessionAt: '2026-11-05T10:00:00Z', lastDayId: 'd2' });
    expect(readPlanStats({})).toBeNull();
    expect(readPlanStats({ progressStats: { completedSessions: 3 } })).toEqual({ completedSessions: 3, lastSessionAt: null, lastDayId: null });
  });
});

describe('member requests', () => {
  const now = Date.parse('2026-11-17T10:00:00Z');

  it('treats a document without a type as a program request', () => {
    expect(requestType({})).toBe('program');
    expect(requestType({ type: 'weird' })).toBe('program');
  });

  it('lets a floor call lapse after a while, other requests stay open', () => {
    const old = new Date(now - FLOOR_HELP_TTL_MS - 1000).toISOString();
    expect(requestStatus({ type: 'floor_help', status: 'pending', createdAt: old }, now)).toBe('expired');
    expect(isOpenRequest({ type: 'floor_help', status: 'pending', createdAt: old }, now)).toBe(false);
    expect(isOpenRequest({ type: 'measurement', status: 'pending', createdAt: old }, now)).toBe(true);
  });

  it('allows accept once and closing only while open', () => {
    expect(nextRequestStatus('pending', 'accept')).toBe('accepted');
    expect(nextRequestStatus('accepted', 'accept')).toBeNull();
    expect(nextRequestStatus('accepted', 'fulfill')).toBe('fulfilled');
    expect(nextRequestStatus('fulfilled', 'reject')).toBeNull();
    expect(nextRequestStatus('pending', 'cancel')).toBe('cancelled');
  });

  it('shows a trainer their own, unassigned and floor requests', () => {
    expect(visibleToTrainer({ trainerId: 's1' }, ['s1', 'uid'])).toBe(true);
    expect(visibleToTrainer({ trainerId: null }, ['s1'])).toBe(true);
    expect(visibleToTrainer({ trainerId: 's2', type: 'floor_help' }, ['s1'])).toBe(true);
    expect(visibleToTrainer({ trainerId: 's2' }, ['s1'])).toBe(false);
  });
});

describe('presence', () => {
  const now = Date.parse('2026-11-17T15:42:00Z');
  const at = (offsetMs: number) => new Date(now + offsetMs).toISOString();
  const signal = (direction: string, offsetMs: number) => ({ userId: 'u1', status: 'granted', direction, gateName: 'Ana Turnike', timestamp: at(offsetMs) });

  it('greets a fresh entry once per visit and ignores late, older events', () => {
    const first = reducePresence(null, [signal('in', -60_000)], now);
    expect(first.welcome).not.toBeNull();
    expect(first.next).toMatchObject({ lastInAt: at(-60_000), gateName: 'Ana Turnike' });
    const again = reducePresence(first.next, [signal('in', 0)], now);
    expect(again.welcome).toBeNull();
    expect(reducePresence(again.next, [signal('out', -120_000)], now).next).toBeNull();
  });

  it('does not greet an event an offline device delivered late', () => {
    expect(reducePresence(null, [signal('in', -WELCOME_FRESH_MS - 60_000)], now).welcome).toBeNull();
  });

  it('is inside after an entry until an exit or a few hours pass', () => {
    const state = reducePresence(null, [signal('in', -60_000)], now).next;
    expect(presenceView(state, now)).toMatchObject({ inside: true, today: true });
    expect(presenceView(state, now + INSIDE_MAX_MS)).toMatchObject({ inside: false });
    const out = reducePresence(state, [signal('out', 0)], now).next;
    expect(presenceView(out, now).inside).toBe(false);
  });

  it('starts the day at midnight Türkiye time and rebuilds from the access log', () => {
    expect(new Date(startOfDayTr(now)).toISOString()).toBe('2026-11-16T21:00:00.000Z');
    const state = presenceFromLogs([
      { status: 'denied', direction: 'in', timestamp: at(0) },
      { status: 'granted', direction: 'in', timestamp: at(-3_600_000), gateName: 'Kapı' },
    ]);
    expect(state).toMatchObject({ lastInAt: at(-3_600_000), gateName: 'Kapı', lastOutAt: null });
  });
});

describe('live session', () => {
  const nowIso = '2026-11-17T15:00:00.000Z';
  const now = Date.parse(nowIso);

  it('recounts totals from the sets and clamps the current exercise', () => {
    const live = buildLiveSession(
      {
        status: 'active',
        exerciseIndex: 9,
        exercises: [
          { name: 'Bench Press', sets: [{ weight: 60, reps: 8, status: 'completed' }, { weight: 60, reps: 8, status: 'completed' }] },
          { name: 'Row', sets: [{ weight: 40, reps: 10, status: 'completed' }, { weight: -5, reps: 10, status: 'bogus' }] },
        ],
      },
      nowIso,
    );
    expect(live).toMatchObject({ exerciseIndex: 1, exerciseName: 'Row', completedSets: 3, totalSets: 4, completedExercises: 1, percent: 75 });
    expect(live.exercises[1].sets[1]).toEqual({ weight: 0, reps: 10, status: 'pending' });
  });

  it('hides snapshots of finished or abandoned workouts', () => {
    const live = buildLiveSession({ status: 'active', exerciseIndex: 0, exercises: [] }, nowIso);
    expect(liveView({ status: 'active', live }, now)).not.toBeNull();
    expect(liveView({ status: 'completed', live }, now)).toBeNull();
    expect(liveView({ status: 'active', live }, now + LIVE_STALE_MS + 1)).toBeNull();
    expect(liveSummary({ id: 's1', status: 'active', live }, now)).not.toHaveProperty('exercises');
  });
});

describe('coach rules', () => {
  const now = Date.parse('2026-11-17T15:00:00Z');
  const progress = (state: string) => ({ state }) as never;

  it('flags help, live workouts, missing or finished programs and ending memberships', () => {
    expect(
      coachFlags({
        requests: [{ type: 'floor_help', status: 'pending', createdAt: new Date(now).toISOString() }, { type: 'measurement', status: 'pending' }],
        live: true,
        activePlanProgress: [],
        membershipEndsAt: new Date(now + 3 * 86_400_000).toISOString(),
        now,
      }),
    ).toEqual(['help', 'live', 'request', 'no_program', 'membership_ending']);
    expect(coachFlags({ requests: [], live: false, activePlanProgress: [progress('target_reached')], membershipEndsAt: null, now })).toEqual([
      'program_done',
    ]);
    expect(coachFlags({ requests: [], live: false, activePlanProgress: [progress('behind')], membershipEndsAt: null, now })).toEqual(['behind']);
  });

  it('matches the trainer by staff id or sign-in id', () => {
    expect(isMine({ trainerId: 'uid' }, ['s1', 'uid'])).toBe(true);
    expect(isMine({ trainerId: null }, ['s1'])).toBe(false);
  });

  it('orders the floor: help, live, then own members, newest arrival first', () => {
    const row = (name: string, flags: string[], mine: boolean, lastInAt: string) => ({ name, flags, mine, inside: true, lastInAt }) as never;
    const rows = [
      row('a', [], false, '2026-11-17T10:00:00Z'),
      row('b', ['live'], false, '2026-11-17T09:00:00Z'),
      row('c', [], true, '2026-11-17T08:00:00Z'),
      row('d', ['help'], false, '2026-11-17T07:00:00Z'),
      row('e', [], false, '2026-11-17T11:00:00Z'),
    ];
    expect(rows.sort(compareFloor).map((item: { name: string }) => item.name)).toEqual(['d', 'b', 'c', 'e', 'a']);
  });

  it('counts this month entries in Türkiye time', () => {
    const logs = [
      { status: 'granted', direction: 'in', timestamp: '2026-11-01T00:30:00+03:00' },
      { status: 'granted', direction: 'in', timestamp: '2026-10-31T23:30:00+03:00' },
      { status: 'granted', direction: 'out', timestamp: '2026-11-10T10:00:00Z' },
      { status: 'denied', direction: 'in', timestamp: '2026-11-10T10:00:00Z' },
    ];
    expect(visitsThisMonthTr(logs, now)).toBe(1);
  });
});

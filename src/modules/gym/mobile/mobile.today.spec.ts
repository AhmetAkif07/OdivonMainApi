import { lastSet, pickTodayWorkout, previousSet, sessionPerformance, summarizeWeek, weekStart } from './mobile.service';

const plan = (id: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    createdAt: 'x',
    updatedAt: 'x',
    title: id,
    days: [
      { id: 'd1', name: 'İtiş', exercises: [{ name: 'Bench', muscleGroup: 'chest' }] },
      {
        id: 'd2',
        name: 'Çekiş',
        exercises: [
          { name: 'Row', muscleGroup: 'back' },
          { name: 'Curl', muscleGroup: 'arms' },
        ],
      },
    ],
    ...extra,
  }) as never;

const session = (
  planId: string,
  dayId: string | null,
  completedAt: string,
  extra: Record<string, unknown> = {},
) =>
  ({
    id: `${planId}-${completedAt}`,
    createdAt: 'x',
    updatedAt: 'x',
    userId: 'u1',
    status: 'completed',
    planId,
    dayId,
    completedAt,
    ...extra,
  }) as never;

describe('mobile today helpers', () => {
  it('suggests the day after the last trained one, wrapping around', () => {
    expect(pickTodayWorkout([plan('p')], [])).toMatchObject({
      planId: 'p',
      dayId: 'd1',
      dayOrder: 1,
      dayCount: 2,
    });
    expect(
      pickTodayWorkout([plan('p')], [session('p', 'd1', '2026-10-20T10:00:00Z')]),
    ).toMatchObject({
      dayId: 'd2',
      exerciseCount: 2,
      muscleGroups: ['back', 'arms'],
    });
    expect(
      pickTodayWorkout([plan('p')], [session('p', 'd2', '2026-10-20T10:00:00Z')]),
    ).toMatchObject({ dayId: 'd1' });
    expect(pickTodayWorkout([], [])).toBeNull();
  });

  it('prefers the active plan trained most recently', () => {
    const sessions = [
      session('b', 'd1', '2026-10-21T10:00:00Z'),
      session('a', 'd1', '2026-10-20T10:00:00Z'),
    ];
    expect(pickTodayWorkout([plan('a'), plan('b')], sessions)).toMatchObject({
      planId: 'b',
      dayId: 'd2',
    });
  });

  it('counts this week from Monday in Türkiye time', () => {
    // Wednesday 2026-10-28 12:00 TRT; Monday 00:00 TRT = Sunday 21:00 UTC.
    const now = Date.parse('2026-10-28T09:00:00Z');
    expect(new Date(weekStart(now)).toISOString()).toBe('2026-10-25T21:00:00.000Z');
    const summary = summarizeWeek(
      [
        session('p', 'd1', '2026-10-27T10:00:00Z', { volumeKg: 1000, activeDurationMs: 3_600_000 }),
        session('p', 'd2', '2026-10-25T22:00:00Z', { volumeKg: 500 }),
        session('p', 'd1', '2026-10-25T20:00:00Z', { volumeKg: 9999 }),
      ],
      3,
      now,
    );
    expect(summary).toEqual({ target: 3, done: 2, volumeKg: 1500, activeDurationMs: 3_600_000 });
  });

  it('turns completed session sets into per-exercise history', () => {
    const entries = sessionPerformance(
      [
        session('p', 'd1', '2026-10-20T10:00:00Z', {
          sets: [
            {
              exerciseName: 'Bench',
              exerciseId: 'sys-ex-bench-press',
              index: 1,
              weight: 60,
              reps: 10,
              status: 'completed',
            },
            {
              exerciseName: 'Bench',
              exerciseId: 'sys-ex-bench-press',
              index: 2,
              weight: 70,
              reps: 8,
              status: 'skipped',
            },
          ],
        }),
        session('p', 'd1', '2026-10-21T10:00:00Z', {
          userId: 'other',
          sets: [{ exerciseName: 'Bench', index: 1, weight: 200, reps: 1, status: 'completed' }],
        }),
      ],
      'u1',
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      exerciseName: 'Bench',
      exerciseId: 'sys-ex-bench-press',
      performedAt: '2026-10-20T10:00:00Z',
    });
    expect(entries[0]['sets']).toEqual([
      { setIndex: 1, kg: 60, reps: 10, completed: true },
      { setIndex: 2, kg: 70, reps: 8, completed: false },
    ]);
  });
});

describe('previousSet / lastSet', () => {
  const entry = (at: string, kgs: number[]) =>
    ({
      id: at,
      createdAt: at,
      exerciseName: 'Deadlift',
      exerciseId: 'sys-ex-deadlift',
      performedAt: at,
      sets: kgs.map((kg) => ({ kg, reps: 5, completed: true })),
    }) as never;
  const history = [entry('2026-10-20T15:00:00Z', [100, 100]), entry('2026-10-27T15:00:00Z', [90, 95])];

  it('previousSet is the all-time weight record', () => {
    expect(previousSet(history, 'Deadlift', undefined, 'sys-ex-deadlift')).toMatchObject({ kg: 100 });
  });

  it('lastSet is the top set of the most recent workout', () => {
    expect(lastSet(history, 'Deadlift', undefined, 'sys-ex-deadlift')).toMatchObject({ kg: 95, at: '2026-10-27T15:00:00Z' });
  });

  it('both are null for a new exercise', () => {
    expect(previousSet([], 'Deadlift')).toBeNull();
    expect(lastSet([], 'Deadlift')).toBeNull();
  });
});

import { settleWorkoutSession } from './workout-session.math';

describe('settleWorkoutSession', () => {
  it('ignores inflated client volume and pr, and marks fallback weight', () => {
    const settled = settleWorkoutSession({
      startedAt: '2026-09-27T10:00:00.000Z',
      completedAt: '2026-09-27T10:48:00.000Z',
      pausedDurationMs: 2 * 60_000,
      restDurationMs: 10 * 60_000,
      sets: [
        { exerciseName: 'Bench Press', weight: 70, reps: 8, status: 'completed' },
        { exerciseName: 'Bench Press', weight: 70, reps: 8, status: 'completed' },
        { exerciseName: 'Squat', weight: 80, reps: 5, status: 'skipped' },
      ],
      priorBestKg: { 'Bench Press': 65 },
    });
    expect(settled.volumeKg).toBe(1120);
    expect(settled.prCount).toBe(1);
    expect(settled.activeDurationMs).toBe(36 * 60_000);
    expect(settled.calories.weightSource).toBe('fallback');
    expect(settled.calories.weightKg).toBe(70);
    expect(settled.calories.method).toBe('estimated_strength_training');
    expect(settled.calories.max).toBeGreaterThan(settled.calories.min);
  });
});

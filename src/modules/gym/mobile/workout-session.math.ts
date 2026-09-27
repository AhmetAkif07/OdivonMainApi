export type SessionSetInput = {
  exerciseName: string;
  weight: number;
  reps: number;
  status: string;
};

export type SettledSession = {
  volumeKg: number;
  prCount: number;
  activeDurationMs: number;
  calories: {
    min: number;
    max: number;
    method: 'estimated_strength_training';
    weightKg: number;
    weightSource: 'member_measurement' | 'profile' | 'fallback';
  };
};

const STRENGTH_MET = 6;
const FALLBACK_KG = 70;

export function settleWorkoutSession(input: {
  startedAt: string;
  completedAt: string;
  pausedDurationMs: number;
  restDurationMs: number;
  sets: SessionSetInput[];
  priorBestKg: Record<string, number>;
  measurementKg?: number | null;
  profileKg?: number | null;
}): SettledSession {
  const volume = input.sets
    .filter((set) => set.status === 'completed')
    .reduce((sum, set) => sum + set.weight * set.reps, 0);
  const prNames = new Set<string>();
  for (const set of input.sets) {
    if (set.status !== 'completed') continue;
    const best = input.priorBestKg[set.exerciseName];
    if (best != null && set.weight > best) {
      prNames.add(set.exerciseName);
    }
  }
  const elapsed = new Date(input.completedAt).getTime() - new Date(input.startedAt).getTime();
  const active = Math.max(0, elapsed - input.pausedDurationMs - input.restDurationMs);
  const measurement = input.measurementKg != null && input.measurementKg > 0 ? input.measurementKg : null;
  const profile = input.profileKg != null && input.profileKg > 0 ? input.profileKg : null;
  const weightKg = measurement ?? profile ?? FALLBACK_KG;
  const weightSource = measurement != null ? 'member_measurement' : profile != null ? 'profile' : 'fallback';
  const mid = STRENGTH_MET * weightKg * (active / 3_600_000);
  return {
    volumeKg: Math.round(volume),
    prCount: prNames.size,
    activeDurationMs: active,
    calories: {
      min: Math.round(mid * 0.85),
      max: Math.round(mid * 1.15),
      method: 'estimated_strength_training',
      weightKg,
      weightSource,
    },
  };
}

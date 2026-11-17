/**
 * Snapshot of a workout in progress, sent by the member's app so a trainer can see where the
 * member is. It is a view only: the real record is written when the workout is completed.
 */

/** A snapshot this old means the workout was abandoned or the phone is gone. */
export const LIVE_STALE_MS = 3 * 3_600_000;
const MAX_EXERCISES = 60;
const MAX_SETS = 20;

export interface LiveSet {
  weight: number;
  reps: number;
  status: 'pending' | 'completed' | 'skipped';
}

export interface LiveExercise {
  name: string;
  exerciseId: string | null;
  sets: LiveSet[];
}

export interface LiveSession {
  status: 'active' | 'paused';
  exerciseIndex: number;
  exerciseName: string | null;
  completedSets: number;
  totalSets: number;
  completedExercises: number;
  totalExercises: number;
  percent: number;
  restEndsAt: string | null;
  exercises: LiveExercise[];
  updatedAt: string;
}

type Raw = Record<string, unknown>;

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

/** Builds the stored snapshot from client input; the totals are recounted from the sets. */
export function buildLiveSession(input: Raw, nowIso: string): LiveSession {
  const rawExercises = Array.isArray(input['exercises']) ? (input['exercises'] as Raw[]) : [];
  const exercises: LiveExercise[] = rawExercises.slice(0, MAX_EXERCISES).map((exercise) => ({
    name: String(exercise['name'] ?? '').slice(0, 200),
    exerciseId: typeof exercise['exerciseId'] === 'string' && exercise['exerciseId'] ? exercise['exerciseId'] : null,
    sets: (Array.isArray(exercise['sets']) ? (exercise['sets'] as Raw[]) : []).slice(0, MAX_SETS).map((set) => ({
      weight: count(set['weight']),
      reps: Math.round(count(set['reps'])),
      status: set['status'] === 'completed' ? 'completed' : set['status'] === 'skipped' ? 'skipped' : 'pending',
    })),
  }));
  const allSets = exercises.flatMap((exercise) => exercise.sets);
  const completedSets = allSets.filter((set) => set.status === 'completed').length;
  const index = Math.min(Math.max(0, Math.round(count(input['exerciseIndex']))), Math.max(0, exercises.length - 1));
  return {
    status: input['status'] === 'paused' ? 'paused' : 'active',
    exerciseIndex: index,
    exerciseName: exercises[index]?.name || null,
    completedSets,
    totalSets: allSets.length,
    completedExercises: exercises.filter(
      (exercise) => exercise.sets.length > 0 && exercise.sets.every((set) => set.status === 'completed'),
    ).length,
    totalExercises: exercises.length,
    percent: allSets.length ? Math.round((completedSets / allSets.length) * 100) : 0,
    restEndsAt: typeof input['restEndsAt'] === 'string' && input['restEndsAt'] ? input['restEndsAt'] : null,
    exercises,
    updatedAt: nowIso,
  };
}

/** The snapshot of a session that is still running, or null when there is none worth showing. */
export function liveView(session: Raw, now = Date.now()): LiveSession | null {
  if (session['status'] !== 'active') return null;
  const live = session['live'];
  if (!live || typeof live !== 'object') return null;
  const updatedAt = new Date(String((live as Raw)['updatedAt'] ?? '')).getTime();
  if (Number.isNaN(updatedAt) || now - updatedAt > LIVE_STALE_MS) return null;
  return live as LiveSession;
}

/** Same snapshot without the per-set table, for lists. */
export function liveSummary(session: Raw, now = Date.now()) {
  const live = liveView(session, now);
  if (!live) return null;
  const { exercises: _exercises, ...summary } = live;
  return { sessionId: String(session['id'] ?? ''), startedAt: String(session['startedAt'] ?? ''), ...summary };
}

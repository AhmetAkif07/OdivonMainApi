import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { GymStore } from './gym-store';
import { PlanProgressStats, readPlanStats, statsFromSessions } from './plan-progress';

type Doc = BaseDocument & Record<string, unknown>;

/**
 * A plan's counters: the ones stored on it, or (for plans written before the counters existed)
 * counted once from that plan's own sessions and stored for the next read.
 */
export async function loadPlanStats(store: GymStore, plan: Doc): Promise<PlanProgressStats> {
  const stored = readPlanStats(plan);
  if (stored) return stored;
  const sessions = await store.listBy<Doc>(TENANT_COLLECTION.gymWorkoutSessions, 'planId', plan.id);
  const stats = statsFromSessions(plan.id, sessions);
  await savePlanStats(store, plan.id, stats);
  return stats;
}

/** A derived cache: written without touching `updatedAt`, and a deleted plan is simply skipped. */
export async function savePlanStats(store: GymStore, planId: string, stats: PlanProgressStats): Promise<void> {
  await store
    .collection(TENANT_COLLECTION.gymWorkoutPlans)
    .doc(planId)
    .update({ progressStats: stats })
    .catch(() => undefined);
}

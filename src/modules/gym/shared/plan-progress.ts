import { BaseDocument } from '../../../shared/firestore/base-document';
import { PlanDay, planContent } from './workout-plan.normalize';

/**
 * Where a member is in a workout plan. One pure calculation shared by the member app, the trainer
 * app and the panel, so all three show the same numbers.
 *
 * A plan may carry a period: `durationWeeks` × `targetDaysPerWeek` = the number of workouts it is
 * meant to last. Reaching that number or passing the end date only changes `state`; the plan's
 * own `status` is never touched here, so the member can keep training until the trainer closes
 * or deletes the plan.
 */

type Doc = BaseDocument & Record<string, unknown>;

const WEEK_MS = 7 * 86_400_000;
export const MAX_PLAN_WEEKS = 104;

/** Counters kept on the plan document (`progressStats`) so lists need no session reads. */
export interface PlanProgressStats {
  completedSessions: number;
  lastSessionAt: string | null;
  /** Day of the most recent completed workout that named one; the next day follows it. */
  lastDayId: string | null;
}

export type PlanProgressState = 'open' | 'on_track' | 'behind' | 'target_reached' | 'period_over';

export interface PlanProgress {
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  targetSessions: number | null;
  completedSessions: number;
  /** 0–100 of the target; null for a plan without a period. */
  percent: number | null;
  /** 1-based week of the period, capped at `durationWeeks`. */
  week: number | null;
  startsAt: string;
  endsAt: string | null;
  dayCount: number;
  /** 1-based pass through the plan's days, and how many days of this pass are done. */
  cycle: number;
  cycleDone: number;
  nextDayId: string | null;
  nextDayName: string | null;
  nextDayOrder: number | null;
  lastSessionAt: string | null;
  state: PlanProgressState;
}

function wholeNumber(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= min && rounded <= max ? rounded : null;
}

function time(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Period fields for a plan write. `durationWeeks: 0` (or anything out of range) clears the period;
 * a period always rewrites `endDate` as start + weeks, also when only the start date moves.
 * Returns `{}` when the write does not touch the period, so other fields stay as they are.
 */
export function planPeriodPatch(
  dto: { durationWeeks?: unknown; targetDaysPerWeek?: unknown; startDate?: unknown },
  current?: Record<string, unknown> | null,
  now = Date.now(),
): { durationWeeks?: number | null; targetDaysPerWeek?: number | null; endDate?: string | null } {
  const patch: { durationWeeks?: number | null; targetDaysPerWeek?: number | null; endDate?: string | null } = {};
  if (dto.targetDaysPerWeek !== undefined) patch.targetDaysPerWeek = wholeNumber(dto.targetDaysPerWeek, 1, 7);
  const currentWeeks = wholeNumber(current?.['durationWeeks'], 1, MAX_PLAN_WEEKS);
  const movesStart = dto.startDate !== undefined && currentWeeks !== null;
  if (dto.durationWeeks === undefined && !movesStart) return patch;
  const weeks = dto.durationWeeks === undefined ? currentWeeks : wholeNumber(dto.durationWeeks, 1, MAX_PLAN_WEEKS);
  if (dto.durationWeeks !== undefined) patch.durationWeeks = weeks;
  const start = time(dto.startDate) ?? time(current?.['startDate']) ?? time(current?.['createdAt']) ?? now;
  patch.endDate = weeks ? new Date(start + weeks * WEEK_MS).toISOString() : null;
  return patch;
}

/** Counters of one plan from workout-session documents (any member's; filtered by plan id). */
export function statsFromSessions(planId: string, sessions: Doc[]): PlanProgressStats {
  const done = sessions
    .filter((session) => session['planId'] === planId && session['status'] === 'completed')
    .sort((left, right) => String(right['completedAt'] ?? '').localeCompare(String(left['completedAt'] ?? '')));
  const withDay = done.find((session) => session['dayId']);
  return {
    completedSessions: done.length,
    lastSessionAt: done[0] ? String(done[0]['completedAt'] ?? done[0].createdAt) : null,
    lastDayId: withDay ? String(withDay['dayId']) : null,
  };
}

/** The counters stored on a plan, or null when the plan has none yet (written before they existed). */
export function readPlanStats(plan: Record<string, unknown>): PlanProgressStats | null {
  const stored = plan['progressStats'];
  if (!stored || typeof stored !== 'object') return null;
  const stats = stored as Record<string, unknown>;
  const completed = wholeNumber(stats['completedSessions'], 0, 1_000_000);
  if (completed === null) return null;
  return {
    completedSessions: completed,
    lastSessionAt: typeof stats['lastSessionAt'] === 'string' ? stats['lastSessionAt'] : null,
    lastDayId: typeof stats['lastDayId'] === 'string' ? stats['lastDayId'] : null,
  };
}

/** The day after the last one trained, wrapping around; the first day for a plan never trained. */
export function nextPlanDay(days: PlanDay[], lastDayId: string | null): PlanDay | null {
  if (!days.length) return null;
  const lastIndex = lastDayId ? days.findIndex((day) => day.id === lastDayId) : -1;
  return days[(lastIndex + 1) % days.length];
}

export function planProgress(plan: Doc, stats: PlanProgressStats, now = Date.now()): PlanProgress {
  const { days } = planContent(plan);
  const startMs = time(plan['startDate']) ?? time(plan.createdAt) ?? now;
  const durationWeeks = wholeNumber(plan['durationWeeks'], 1, MAX_PLAN_WEEKS);
  const sessionsPerWeek =
    wholeNumber(plan['targetDaysPerWeek'], 1, 7) ?? (durationWeeks ? Math.min(7, Math.max(1, days.length)) : null);
  const targetSessions = durationWeeks && sessionsPerWeek ? durationWeeks * sessionsPerWeek : null;
  const endMs = durationWeeks ? startMs + durationWeeks * WEEK_MS : time(plan['endDate']);
  const completed = stats.completedSessions;
  const elapsedWeeks = Math.max(0, (now - startMs) / WEEK_MS);

  let state: PlanProgressState = 'open';
  if (targetSessions && completed >= targetSessions) {
    state = 'target_reached';
  } else if (endMs !== null && now > endMs) {
    state = 'period_over';
  } else if (targetSessions && sessionsPerWeek) {
    // More than a full week of workouts short of the pace the period asks for.
    state = completed < Math.floor(elapsedWeeks * sessionsPerWeek) - sessionsPerWeek ? 'behind' : 'on_track';
  }

  const next = nextPlanDay(days, stats.lastDayId);
  return {
    durationWeeks,
    sessionsPerWeek,
    targetSessions,
    completedSessions: completed,
    percent: targetSessions ? Math.min(100, Math.round((completed / targetSessions) * 100)) : null,
    week: durationWeeks ? Math.min(durationWeeks, Math.floor(elapsedWeeks) + 1) : null,
    startsAt: new Date(startMs).toISOString(),
    endsAt: endMs !== null ? new Date(endMs).toISOString() : null,
    dayCount: days.length,
    cycle: days.length ? Math.floor(completed / days.length) + 1 : 1,
    cycleDone: days.length ? completed % days.length : 0,
    nextDayId: next?.id ?? null,
    nextDayName: next ? next.name || `${next.order}. Gün` : null,
    nextDayOrder: next?.order ?? null,
    lastSessionAt: stats.lastSessionAt,
    state,
  };
}

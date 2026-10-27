/**
 * Workout plans are stored in two shapes at once:
 * - `days[]`: the structured shape the new mobile app and the panel edit
 *   (day → exercises → optional per-set targets);
 * - `exercises[]`: the legacy flat list where the day lives in `dayName` ("2. Gün: İtiş").
 *   The old Flutter app and older panel screens only read this one.
 * Writes accept either shape and store both; reads always answer with both.
 */

export const MAX_PLAN_EXERCISES = 200;
export const MAX_PLAN_DAYS = 14;
const MAX_SET_TARGETS = 20;

export type SetTargetType = 'normal' | 'warmup' | 'drop';

export interface PlanSetTarget {
  reps?: number | string;
  weight?: number;
  type: SetTargetType;
}

export interface PlanExercise {
  id: string;
  exerciseId?: string;
  name: string;
  muscleGroup?: string;
  equipmentName?: string;
  dayName?: string;
  sets?: number;
  reps?: number | string;
  weight?: number;
  restSeconds?: number;
  duration?: number;
  notes?: string;
  setTargets?: PlanSetTarget[];
  supersetGroup?: string;
  superSet?: PlanExercise;
}

export interface PlanDay {
  id: string;
  name: string;
  order: number;
  focus?: string;
  exercises: PlanExercise[];
}

const EXERCISE_TEXT = ['id', 'exerciseId', 'name', 'muscleGroup', 'equipmentName', 'dayName', 'notes', 'supersetGroup'] as const;
const EXERCISE_NUMBER = ['sets', 'weight', 'restSeconds', 'duration'] as const;
const SET_TYPES: SetTargetType[] = ['normal', 'warmup', 'drop'];

type Raw = Record<string, unknown>;

function isObject(value: unknown): value is Raw {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: unknown, max = 500): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function repsValue(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 50);
  return undefined;
}

function cleanSetTargets(value: unknown): PlanSetTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const targets = value
    .filter(isObject)
    .slice(0, MAX_SET_TARGETS)
    .map((item) => {
      const target: PlanSetTarget = {
        type: SET_TYPES.includes(item['type'] as SetTargetType) ? (item['type'] as SetTargetType) : 'normal',
      };
      const reps = repsValue(item['reps']);
      if (reps !== undefined) target.reps = reps;
      const weight = finiteNumber(item['weight']);
      if (weight !== null) target.weight = weight;
      return target;
    });
  return targets.length ? targets : undefined;
}

/**
 * Keeps only the known exercise fields so no arbitrary data lands on a plan.
 * `fallbackId` gives exercises without an id a stable one (same input → same id).
 */
export function cleanPlanExercise(raw: unknown, fallbackId: string, nested = false): PlanExercise | null {
  if (!isObject(raw)) return null;
  const name = text(raw['name']);
  if (!name) return null;
  const out: Raw = {};
  for (const key of EXERCISE_TEXT) {
    const value = text(raw[key]);
    if (value) out[key] = value;
  }
  for (const key of EXERCISE_NUMBER) {
    const value = finiteNumber(raw[key]);
    if (value !== null) out[key] = value;
  }
  const reps = repsValue(raw['reps']);
  if (reps !== undefined) out['reps'] = reps;
  const setTargets = cleanSetTargets(raw['setTargets']);
  if (setTargets) out['setTargets'] = setTargets;
  if (!nested) {
    const superSet = cleanPlanExercise(raw['superSet'], `${fallbackId}-ss`, true);
    if (superSet) out['superSet'] = superSet;
  }
  out['name'] = name;
  out['id'] = (out['id'] as string | undefined) ?? fallbackId;
  return out as unknown as PlanExercise;
}

/** "2. Gün: İtiş" → { order: 2, name: "İtiş" }; "Göğüs" → { order: null, name: "Göğüs" }. */
export function parseDayName(dayName?: string | null): { order: number | null; name: string } {
  const value = (dayName ?? '').trim();
  const match = /^(\d+)\s*\.\s*(?:Gün|Day)?\s*:?\s*(.*)$/i.exec(value);
  if (!match) return { order: null, name: value };
  const order = Number(match[1]);
  return { order: Number.isFinite(order) && order > 0 ? order : null, name: match[2].trim() };
}

export function legacyDayName(day: Pick<PlanDay, 'order' | 'name'>): string {
  return day.name ? `${day.order}. Gün: ${day.name}` : `${day.order}. Gün`;
}

/** Groups the legacy flat list by `dayName`. Exercises without a day go to day 1. */
export function daysFromExercises(exercises: unknown[]): PlanDay[] {
  const byOrder = new Map<number, PlanDay>();
  const unnumbered = new Map<string, number>();
  let index = 0;
  for (const raw of exercises) {
    if (!isObject(raw)) continue;
    const parsed = parseDayName(typeof raw['dayName'] === 'string' ? raw['dayName'] : null);
    let order = parsed.order;
    if (order === null) {
      // "Göğüs" style names without a number: each distinct name becomes its own day.
      const key = parsed.name.toLowerCase();
      if (!key) order = 1;
      else {
        if (!unnumbered.has(key)) unnumbered.set(key, 1000 + unnumbered.size);
        order = unnumbered.get(key)!;
      }
    }
    let day = byOrder.get(order);
    if (!day) {
      day = { id: `day-${order}`, name: parsed.name, order, exercises: [] };
      byOrder.set(order, day);
    } else if (!day.name && parsed.name) {
      day.name = parsed.name;
    }
    const exercise = cleanPlanExercise(raw, `ex-${order}-${index}`);
    index += 1;
    if (exercise) {
      delete exercise.dayName;
      day.exercises.push(exercise);
    }
  }
  return renumber([...byOrder.values()].sort((left, right) => left.order - right.order));
}

/** Validates client-sent days: unknown fields dropped, order rewritten as 1..n. */
export function cleanDays(days: unknown[]): PlanDay[] {
  const cleaned: PlanDay[] = [];
  let total = 0;
  days
    .filter(isObject)
    .slice(0, MAX_PLAN_DAYS)
    .map((raw, position) => ({ raw, position, order: finiteNumber(raw['order']) ?? position + 1 }))
    .sort((left, right) => left.order - right.order || left.position - right.position)
    .forEach(({ raw }, position) => {
      const order = position + 1;
      const exercises: PlanExercise[] = [];
      const list = Array.isArray(raw['exercises']) ? raw['exercises'] : [];
      list.forEach((item, index) => {
        if (total >= MAX_PLAN_EXERCISES) return;
        const exercise = cleanPlanExercise(item, `ex-${order}-${index}`);
        if (!exercise) return;
        delete exercise.dayName;
        exercises.push(exercise);
        total += 1;
      });
      const day: PlanDay = {
        id: text(raw['id'], 100) ?? `day-${order}`,
        name: text(raw['name'], 100) ?? '',
        order,
        exercises,
      };
      const focus = text(raw['focus'], 200);
      if (focus) day.focus = focus;
      cleaned.push(day);
    });
  return cleaned;
}

/** Flattens days into the legacy list, writing each exercise's `dayName`. */
export function exercisesFromDays(days: PlanDay[]): PlanExercise[] {
  return days.flatMap((day) =>
    day.exercises.map((exercise) => ({ ...exercise, dayName: legacyDayName(day) })),
  );
}

/**
 * Shape for a write: `days` wins when sent; otherwise `exercises` is the source.
 * Returns `{}` when neither is sent, so a partial update leaves both untouched.
 */
export function normalizePlanContent(input: { days?: unknown; exercises?: unknown }): {
  days?: PlanDay[];
  exercises?: PlanExercise[];
} {
  if (Array.isArray(input.days)) {
    const days = cleanDays(input.days);
    return { days, exercises: exercisesFromDays(days) };
  }
  if (Array.isArray(input.exercises)) {
    const days = daysFromExercises(input.exercises.slice(0, MAX_PLAN_EXERCISES));
    return { days, exercises: exercisesFromDays(days) };
  }
  return {};
}

/** Shape for a read: stored `days` when present, else derived from the legacy list. */
export function readPlanDays(source: object): PlanDay[] {
  const item = source as { days?: unknown; exercises?: unknown };
  if (Array.isArray(item.days) && item.days.length) return cleanDays(item.days);
  return daysFromExercises(Array.isArray(item.exercises) ? item.exercises : []);
}

function renumber(days: PlanDay[]): PlanDay[] {
  return days.map((day, index) => {
    const order = index + 1;
    return order === day.order ? day : { ...day, order, id: `day-${order}` };
  });
}

/** Both plan shapes for a read; plans written before `days` existed get them derived. */
export function planContent(item: object) {
  const days = readPlanDays(item);
  return { days, exercises: exercisesFromDays(days) };
}

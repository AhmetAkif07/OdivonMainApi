/**
 * Illustrations for the built-in catalogue, from the RepDB free tier (https://repdb.co).
 * License: in-app use with a visible "Exercise data by RepDB (repdb.co)" credit; recolored to the
 * Odivon palette by scripts/repdb-images.mjs into static/<EXERCISE_MEDIA_PREFIX>/, which the Worker
 * serves as static assets (scripts/worker-assets.mjs copies static/ into the asset directory).
 *
 * `pair` exercises have a start and a peak pose (the app loops between them), `main` ones a single
 * pose (holds, cardio). Exercises without a match are simply left out and keep `imageUrl: null`.
 */

export const EXERCISE_MEDIA_HOST = 'https://mainapi.odivon.com';
/** Bump the version when the art changes: files are served with an immutable cache header. */
export const EXERCISE_MEDIA_PREFIX = 'exercise-media/repdb/v1';

export type ExerciseMediaKind = 'pair' | 'main';

// prettier-ignore
export const SYSTEM_EXERCISE_MEDIA: Record<string, [repdbId: string, kind: ExerciseMediaKind]> = {
  'bench-press': ['bench-press', 'pair'],
  'incline-bench-press': ['incline-bench-press', 'pair'],
  'decline-bench-press': ['decline-bench-press-barbell', 'pair'],
  'dumbbell-bench-press': ['db-bench-press', 'pair'],
  'incline-dumbbell-press': ['incline-db-press', 'pair'],
  'dumbbell-fly': ['db-fly', 'pair'],
  'incline-dumbbell-fly': ['incline-dumbbell-fly', 'pair'],
  'chest-press-machine': ['chest-press-machine', 'pair'],
  'pec-deck': ['pec-deck', 'pair'],
  'cable-crossover': ['cable-fly', 'pair'],
  'smith-bench-press': ['smith-machine-bench-press', 'pair'],
  'smith-incline-press': ['smith-machine-incline-bench-press', 'pair'],
  'push-up': ['push-up', 'pair'],
  'incline-push-up': ['incline-push-ups', 'pair'],
  'chest-dips': ['dips', 'pair'],
  'dumbbell-pullover': ['db-pullover', 'pair'],
  'deadlift': ['deadlift', 'pair'],
  'barbell-row': ['barbell-row', 'pair'],
  'pendlay-row': ['pendlay-row', 'pair'],
  't-bar-row': ['t-bar-row', 'pair'],
  'dumbbell-row': ['single-arm-db-row', 'pair'],
  'chest-supported-row': ['chest-supported-db-row', 'pair'],
  'lat-pulldown': ['lat-pulldown', 'pair'],
  'close-grip-pulldown': ['close-grip-lat-pulldown', 'pair'],
  'seated-cable-row': ['seated-cable-row', 'pair'],
  'straight-arm-pulldown': ['straight-arm-pulldown', 'pair'],
  'machine-row': ['chest-supported-machine-row', 'pair'],
  'assisted-pull-up': ['assisted-pull-ups', 'pair'],
  'pull-up': ['pull-up', 'pair'],
  'chin-up': ['chin-ups', 'pair'],
  'inverted-row': ['inverted-row', 'pair'],
  'hyperextension': ['back-extension', 'pair'],
  'rack-pull': ['rack-pull', 'pair'],
  'good-morning': ['good-morning', 'pair'],
  'overhead-press': ['ohp', 'pair'],
  'dumbbell-shoulder-press': ['seated-db-press', 'pair'],
  'arnold-press': ['arnold-press', 'pair'],
  'machine-shoulder-press': ['machine-shoulder-press', 'pair'],
  'smith-shoulder-press': ['smith-machine-shoulder-press', 'pair'],
  'lateral-raise': ['lateral-raise', 'pair'],
  'cable-lateral-raise': ['cable-lateral-raise', 'pair'],
  'machine-lateral-raise': ['plate-loaded-lateral-raise', 'pair'],
  'front-raise': ['dumbbell-front-raise', 'pair'],
  'rear-delt-fly': ['rear-delt-fly', 'pair'],
  'reverse-pec-deck': ['machine-reverse-fly', 'pair'],
  'face-pull': ['face-pull', 'pair'],
  'upright-row': ['upright-row', 'pair'],
  'barbell-shrug': ['shrug', 'pair'],
  'dumbbell-shrug': ['db-shrug', 'pair'],
  'back-squat': ['squat', 'pair'],
  'front-squat': ['front-squat', 'pair'],
  'smith-squat': ['smith-machine-squat', 'pair'],
  'hack-squat': ['hack-squat', 'pair'],
  'leg-press': ['leg-press', 'pair'],
  'goblet-squat': ['db-goblet-squat', 'pair'],
  'bulgarian-split-squat': ['bulgarian-split-squat', 'pair'],
  'walking-lunge': ['walking-lunge', 'pair'],
  'reverse-lunge': ['reverse-lunge', 'pair'],
  'step-up': ['step-ups', 'pair'],
  'leg-extension': ['leg-extension', 'pair'],
  'romanian-deadlift': ['romanian-deadlift', 'pair'],
  'dumbbell-rdl': ['dumbbell-romanian-deadlift', 'pair'],
  'lying-leg-curl': ['leg-curl', 'pair'],
  'seated-leg-curl': ['seated-leg-curl', 'pair'],
  'hip-thrust': ['hip-thrust', 'pair'],
  'glute-bridge': ['glute-bridge', 'pair'],
  'cable-kickback': ['cable-kickback', 'pair'],
  'hip-abduction': ['hip-abduction', 'pair'],
  'hip-adduction': ['hip-adduction', 'pair'],
  'standing-calf-raise': ['standing-calf-raise', 'pair'],
  'seated-calf-raise': ['seated-calf-raise', 'pair'],
  'bodyweight-squat': ['bodyweight-squat', 'pair'],
  'kettlebell-swing': ['kettlebell-swing', 'pair'],
  'sumo-deadlift': ['sumo-deadlift', 'pair'],
  'barbell-curl': ['barbell-curl', 'pair'],
  'ez-bar-curl': ['ez-bar-curl', 'pair'],
  'dumbbell-curl': ['bicep-curl', 'pair'],
  'hammer-curl': ['hammer-curl', 'pair'],
  'incline-dumbbell-curl': ['incline-db-curl', 'pair'],
  'preacher-curl': ['preacher-curl', 'pair'],
  'concentration-curl': ['concentration-curl', 'pair'],
  'cable-curl': ['cable-curl', 'pair'],
  'machine-curl': ['machine-bicep-curl', 'pair'],
  'triceps-pushdown': ['tricep-pushdown', 'pair'],
  'overhead-cable-extension': ['cable-overhead-tricep-extension', 'pair'],
  'skull-crusher': ['skull-crusher', 'pair'],
  'dumbbell-overhead-extension': ['overhead-tricep-extension', 'pair'],
  'close-grip-bench-press': ['close-grip-bench-press', 'pair'],
  'triceps-dips': ['straight-bar-dips', 'pair'],
  'bench-dips': ['bench-dips', 'pair'],
  'triceps-kickback': ['tricep-kickback', 'pair'],
  'wrist-curl': ['wrist-curl', 'pair'],
  'reverse-curl': ['reverse-curl', 'pair'],
  'plank': ['plank', 'main'],
  'side-plank': ['side-plank', 'main'],
  'crunch': ['crunches', 'pair'],
  'cable-crunch': ['cable-crunch', 'pair'],
  'machine-crunch': ['machine-seated-crunch', 'pair'],
  'hanging-leg-raise': ['hanging-leg-raise', 'pair'],
  'lying-leg-raise': ['lying-leg-raise', 'pair'],
  'russian-twist': ['russian-twist', 'pair'],
  'bicycle-crunch': ['bicycle-crunch', 'pair'],
  'ab-wheel': ['ab-wheel-rollout', 'pair'],
  'mountain-climber': ['mountain-climbers', 'pair'],
  'dead-bug': ['dead-bug', 'pair'],
  'pallof-press': ['cable-pallof-press', 'pair'],
  'burpee': ['burpees', 'main'],
  'thruster': ['thruster', 'pair'],
  'farmers-walk': ['dumbbell-farmers-walk', 'main'],
  'jumping-jack': ['jumping-jacks', 'pair'],
  'box-jump': ['box-jump', 'pair'],
  'battle-rope': ['battle-ropes', 'main'],
  'treadmill-run': ['treadmill-running', 'main'],
  'incline-walk': ['incline-treadmill-walk', 'main'],
  'stationary-bike': ['stationary-bike', 'main'],
  'elliptical': ['elliptical-trainer', 'main'],
  'rowing-machine': ['rowing-machine', 'pair'],
  'stair-climber': ['stair-climber', 'main'],
  'jump-rope': ['jump-rope', 'main'],
  'band-pull-apart': ['band-pull-apart', 'pair'],
  'band-squat': ['banded-squat', 'pair'],
  'kettlebell-goblet-squat': ['kettlebell-squat', 'pair'],
  'turkish-get-up': ['kettlebell-turkish-get-ups', 'pair'],
};

export function exerciseMediaFiles(repdbId: string, kind: ExerciseMediaKind): string[] {
  return kind === 'pair'
    ? [`${repdbId}-start.webp`, `${repdbId}-peak.webp`]
    : [`${repdbId}-main.webp`];
}

export function exerciseMediaUrl(file: string): string {
  return `${EXERCISE_MEDIA_HOST}/${EXERCISE_MEDIA_PREFIX}/${file}`;
}

/** Frames for a system exercise slug: [start, peak], [main], or [] when there is no illustration. */
export function systemExerciseFrames(slug: string): string[] {
  const media = SYSTEM_EXERCISE_MEDIA[slug];
  return media ? exerciseMediaFiles(...media).map(exerciseMediaUrl) : [];
}

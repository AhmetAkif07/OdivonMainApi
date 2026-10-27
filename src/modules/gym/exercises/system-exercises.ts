/**
 * Built-in exercise catalogue shared by every gym (ids `sys-ex-*`, read only).
 * Lives in code like the `sys-tpl-*` workout templates; gyms and members add their own
 * exercises to `gymExercises`. `muscleGroup` uses the panel's MuscleGroup keys.
 */

export const MUSCLE_GROUPS = ['chest', 'back', 'shoulders', 'legs', 'arms', 'core', 'fullbody'] as const;
export type ExerciseMuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT = [
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'smith',
  'ezbar',
  'cardio',
  'other',
] as const;
export type ExerciseEquipment = (typeof EQUIPMENT)[number];

export const TRACKING_TYPES = ['weight_reps', 'reps', 'duration', 'distance'] as const;
export type ExerciseTrackingType = (typeof TRACKING_TYPES)[number];

export const EQUIPMENT_LABELS: Record<ExerciseEquipment, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  machine: 'Makine',
  cable: 'Kablo',
  bodyweight: 'Vücut Ağırlığı',
  kettlebell: 'Kettlebell',
  band: 'Direnç Bandı',
  smith: 'Smith Machine',
  ezbar: 'Z-Bar',
  cardio: 'Kardiyo Ekipmanı',
  other: 'Diğer',
};

export interface CatalogExercise {
  id: string;
  source: 'system' | 'gym' | 'member';
  name: string;
  nameEn: string;
  muscleGroup: ExerciseMuscleGroup;
  /** Finer target: quads, hamstrings, glutes, calves, lats, traps, biceps, triceps… */
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment: ExerciseEquipment;
  equipmentName: string;
  mechanic: 'compound' | 'isolation';
  trackingType: ExerciseTrackingType;
  defaultSets: number;
  defaultReps: number | string;
  defaultRestSeconds: number;
  instructions: string[];
  imageUrl: string | null;
}

type Row = [
  slug: string,
  name: string,
  nameEn: string,
  group: ExerciseMuscleGroup,
  primary: string,
  equipment: ExerciseEquipment,
  mechanic: 'c' | 'i',
  secondary?: string[],
  tracking?: ExerciseTrackingType,
  reps?: number | string,
];

// prettier-ignore
const ROWS: Row[] = [
  // Göğüs
  ['bench-press', 'Bench Press', 'Barbell Bench Press', 'chest', 'chest', 'barbell', 'c', ['triceps', 'front_delts']],
  ['incline-bench-press', 'Incline Bench Press', 'Incline Barbell Bench Press', 'chest', 'upper_chest', 'barbell', 'c', ['triceps', 'front_delts']],
  ['decline-bench-press', 'Decline Bench Press', 'Decline Barbell Bench Press', 'chest', 'lower_chest', 'barbell', 'c', ['triceps']],
  ['dumbbell-bench-press', 'Dumbbell Bench Press', 'Dumbbell Bench Press', 'chest', 'chest', 'dumbbell', 'c', ['triceps', 'front_delts']],
  ['incline-dumbbell-press', 'Incline Dumbbell Press', 'Incline Dumbbell Press', 'chest', 'upper_chest', 'dumbbell', 'c', ['triceps', 'front_delts']],
  ['dumbbell-fly', 'Dumbbell Fly', 'Dumbbell Fly', 'chest', 'chest', 'dumbbell', 'i'],
  ['incline-dumbbell-fly', 'Incline Dumbbell Fly', 'Incline Dumbbell Fly', 'chest', 'upper_chest', 'dumbbell', 'i'],
  ['chest-press-machine', 'Chest Press Makinesi', 'Machine Chest Press', 'chest', 'chest', 'machine', 'c', ['triceps']],
  ['pec-deck', 'Pec Deck', 'Pec Deck Fly', 'chest', 'chest', 'machine', 'i'],
  ['cable-crossover', 'Cable Crossover', 'Cable Crossover', 'chest', 'chest', 'cable', 'i'],
  ['low-cable-fly', 'Alt Kablo Fly', 'Low Cable Fly', 'chest', 'upper_chest', 'cable', 'i'],
  ['smith-bench-press', 'Smith Bench Press', 'Smith Machine Bench Press', 'chest', 'chest', 'smith', 'c', ['triceps']],
  ['smith-incline-press', 'Smith Incline Press', 'Smith Machine Incline Press', 'chest', 'upper_chest', 'smith', 'c', ['triceps']],
  ['push-up', 'Şınav', 'Push-up', 'chest', 'chest', 'bodyweight', 'c', ['triceps', 'core'], 'reps', 15],
  ['incline-push-up', 'Eğimli Şınav', 'Incline Push-up', 'chest', 'lower_chest', 'bodyweight', 'c', ['triceps'], 'reps', 15],
  ['chest-dips', 'Göğüs Dips', 'Chest Dips', 'chest', 'lower_chest', 'bodyweight', 'c', ['triceps'], 'reps', 10],
  ['dumbbell-pullover', 'Dumbbell Pullover', 'Dumbbell Pullover', 'chest', 'chest', 'dumbbell', 'i', ['lats']],

  // Sırt
  ['deadlift', 'Deadlift', 'Barbell Deadlift', 'back', 'lower_back', 'barbell', 'c', ['glutes', 'hamstrings', 'traps'], 'weight_reps', 5],
  ['barbell-row', 'Barbell Row', 'Barbell Bent Over Row', 'back', 'lats', 'barbell', 'c', ['biceps', 'rear_delts']],
  ['pendlay-row', 'Pendlay Row', 'Pendlay Row', 'back', 'upper_back', 'barbell', 'c', ['biceps'], 'weight_reps', 6],
  ['t-bar-row', 'T-Bar Row', 'T-Bar Row', 'back', 'upper_back', 'barbell', 'c', ['biceps']],
  ['dumbbell-row', 'Tek Kol Dumbbell Row', 'One-Arm Dumbbell Row', 'back', 'lats', 'dumbbell', 'c', ['biceps']],
  ['chest-supported-row', 'Chest Supported Row', 'Chest Supported Dumbbell Row', 'back', 'upper_back', 'dumbbell', 'c', ['rear_delts']],
  ['lat-pulldown', 'Lat Pulldown', 'Lat Pulldown', 'back', 'lats', 'cable', 'c', ['biceps']],
  ['close-grip-pulldown', 'Dar Tutuş Pulldown', 'Close-Grip Lat Pulldown', 'back', 'lats', 'cable', 'c', ['biceps']],
  ['seated-cable-row', 'Seated Cable Row', 'Seated Cable Row', 'back', 'upper_back', 'cable', 'c', ['biceps']],
  ['straight-arm-pulldown', 'Straight Arm Pulldown', 'Straight-Arm Pulldown', 'back', 'lats', 'cable', 'i'],
  ['machine-row', 'Row Makinesi', 'Machine Row', 'back', 'upper_back', 'machine', 'c', ['biceps']],
  ['assisted-pull-up', 'Destekli Barfiks', 'Assisted Pull-up', 'back', 'lats', 'machine', 'c', ['biceps']],
  ['pull-up', 'Barfiks', 'Pull-up', 'back', 'lats', 'bodyweight', 'c', ['biceps'], 'reps', 8],
  ['chin-up', 'Chin-up', 'Chin-up', 'back', 'lats', 'bodyweight', 'c', ['biceps'], 'reps', 8],
  ['inverted-row', 'Inverted Row', 'Inverted Row', 'back', 'upper_back', 'bodyweight', 'c', ['biceps'], 'reps', 12],
  ['hyperextension', 'Hyperextension', 'Back Extension', 'back', 'lower_back', 'bodyweight', 'i', ['glutes'], 'reps', 15],
  ['rack-pull', 'Rack Pull', 'Rack Pull', 'back', 'upper_back', 'barbell', 'c', ['traps'], 'weight_reps', 6],
  ['good-morning', 'Good Morning', 'Good Morning', 'back', 'lower_back', 'barbell', 'c', ['hamstrings']],

  // Omuz
  ['overhead-press', 'Overhead Press', 'Barbell Overhead Press', 'shoulders', 'front_delts', 'barbell', 'c', ['triceps'], 'weight_reps', 8],
  ['dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Seated Dumbbell Shoulder Press', 'shoulders', 'front_delts', 'dumbbell', 'c', ['triceps']],
  ['arnold-press', 'Arnold Press', 'Arnold Press', 'shoulders', 'front_delts', 'dumbbell', 'c', ['side_delts']],
  ['machine-shoulder-press', 'Shoulder Press Makinesi', 'Machine Shoulder Press', 'shoulders', 'front_delts', 'machine', 'c', ['triceps']],
  ['smith-shoulder-press', 'Smith Shoulder Press', 'Smith Machine Shoulder Press', 'shoulders', 'front_delts', 'smith', 'c', ['triceps']],
  ['lateral-raise', 'Lateral Raise', 'Dumbbell Lateral Raise', 'shoulders', 'side_delts', 'dumbbell', 'i', [], 'weight_reps', 15],
  ['cable-lateral-raise', 'Kablo Lateral Raise', 'Cable Lateral Raise', 'shoulders', 'side_delts', 'cable', 'i', [], 'weight_reps', 15],
  ['machine-lateral-raise', 'Lateral Raise Makinesi', 'Machine Lateral Raise', 'shoulders', 'side_delts', 'machine', 'i', [], 'weight_reps', 15],
  ['front-raise', 'Front Raise', 'Dumbbell Front Raise', 'shoulders', 'front_delts', 'dumbbell', 'i'],
  ['rear-delt-fly', 'Rear Delt Fly', 'Dumbbell Rear Delt Fly', 'shoulders', 'rear_delts', 'dumbbell', 'i', [], 'weight_reps', 15],
  ['reverse-pec-deck', 'Reverse Pec Deck', 'Reverse Pec Deck', 'shoulders', 'rear_delts', 'machine', 'i', [], 'weight_reps', 15],
  ['face-pull', 'Face Pull', 'Cable Face Pull', 'shoulders', 'rear_delts', 'cable', 'i', ['upper_back'], 'weight_reps', 15],
  ['upright-row', 'Upright Row', 'Barbell Upright Row', 'shoulders', 'side_delts', 'barbell', 'c', ['traps']],
  ['barbell-shrug', 'Barbell Shrug', 'Barbell Shrug', 'shoulders', 'traps', 'barbell', 'i'],
  ['dumbbell-shrug', 'Dumbbell Shrug', 'Dumbbell Shrug', 'shoulders', 'traps', 'dumbbell', 'i'],

  // Bacak
  ['back-squat', 'Squat', 'Barbell Back Squat', 'legs', 'quads', 'barbell', 'c', ['glutes', 'hamstrings'], 'weight_reps', 8],
  ['front-squat', 'Front Squat', 'Barbell Front Squat', 'legs', 'quads', 'barbell', 'c', ['glutes', 'core'], 'weight_reps', 6],
  ['smith-squat', 'Smith Squat', 'Smith Machine Squat', 'legs', 'quads', 'smith', 'c', ['glutes']],
  ['hack-squat', 'Hack Squat', 'Machine Hack Squat', 'legs', 'quads', 'machine', 'c', ['glutes']],
  ['leg-press', 'Leg Press', 'Leg Press', 'legs', 'quads', 'machine', 'c', ['glutes', 'hamstrings']],
  ['goblet-squat', 'Goblet Squat', 'Goblet Squat', 'legs', 'quads', 'dumbbell', 'c', ['glutes']],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'Bulgarian Split Squat', 'legs', 'quads', 'dumbbell', 'c', ['glutes']],
  ['walking-lunge', 'Walking Lunge', 'Dumbbell Walking Lunge', 'legs', 'quads', 'dumbbell', 'c', ['glutes']],
  ['reverse-lunge', 'Reverse Lunge', 'Reverse Lunge', 'legs', 'glutes', 'dumbbell', 'c', ['quads']],
  ['step-up', 'Step-up', 'Dumbbell Step-up', 'legs', 'quads', 'dumbbell', 'c', ['glutes']],
  ['leg-extension', 'Leg Extension', 'Leg Extension', 'legs', 'quads', 'machine', 'i', [], 'weight_reps', 12],
  ['romanian-deadlift', 'Romanian Deadlift', 'Romanian Deadlift', 'legs', 'hamstrings', 'barbell', 'c', ['glutes', 'lower_back']],
  ['dumbbell-rdl', 'Dumbbell Romanian Deadlift', 'Dumbbell Romanian Deadlift', 'legs', 'hamstrings', 'dumbbell', 'c', ['glutes']],
  ['lying-leg-curl', 'Lying Leg Curl', 'Lying Leg Curl', 'legs', 'hamstrings', 'machine', 'i', [], 'weight_reps', 12],
  ['seated-leg-curl', 'Seated Leg Curl', 'Seated Leg Curl', 'legs', 'hamstrings', 'machine', 'i', [], 'weight_reps', 12],
  ['hip-thrust', 'Hip Thrust', 'Barbell Hip Thrust', 'legs', 'glutes', 'barbell', 'c', ['hamstrings']],
  ['glute-bridge', 'Glute Bridge', 'Glute Bridge', 'legs', 'glutes', 'bodyweight', 'i', ['hamstrings'], 'reps', 15],
  ['cable-kickback', 'Kablo Kickback', 'Cable Glute Kickback', 'legs', 'glutes', 'cable', 'i', [], 'weight_reps', 15],
  ['hip-abduction', 'Hip Abduction Makinesi', 'Hip Abduction Machine', 'legs', 'glutes', 'machine', 'i', [], 'weight_reps', 15],
  ['hip-adduction', 'Hip Adduction Makinesi', 'Hip Adduction Machine', 'legs', 'adductors', 'machine', 'i', [], 'weight_reps', 15],
  ['standing-calf-raise', 'Standing Calf Raise', 'Standing Calf Raise', 'legs', 'calves', 'machine', 'i', [], 'weight_reps', 15],
  ['seated-calf-raise', 'Seated Calf Raise', 'Seated Calf Raise', 'legs', 'calves', 'machine', 'i', [], 'weight_reps', 15],
  ['leg-press-calf-raise', 'Leg Press Calf Raise', 'Leg Press Calf Raise', 'legs', 'calves', 'machine', 'i', [], 'weight_reps', 15],
  ['bodyweight-squat', 'Vücut Ağırlığıyla Squat', 'Bodyweight Squat', 'legs', 'quads', 'bodyweight', 'c', ['glutes'], 'reps', 20],
  ['kettlebell-swing', 'Kettlebell Swing', 'Kettlebell Swing', 'legs', 'glutes', 'kettlebell', 'c', ['hamstrings', 'core'], 'weight_reps', 15],
  ['sumo-deadlift', 'Sumo Deadlift', 'Sumo Deadlift', 'legs', 'glutes', 'barbell', 'c', ['quads', 'adductors'], 'weight_reps', 5],

  // Kol
  ['barbell-curl', 'Barbell Curl', 'Barbell Biceps Curl', 'arms', 'biceps', 'barbell', 'i'],
  ['ez-bar-curl', 'Z-Bar Curl', 'EZ-Bar Curl', 'arms', 'biceps', 'ezbar', 'i'],
  ['dumbbell-curl', 'Dumbbell Curl', 'Dumbbell Biceps Curl', 'arms', 'biceps', 'dumbbell', 'i'],
  ['hammer-curl', 'Hammer Curl', 'Hammer Curl', 'arms', 'brachialis', 'dumbbell', 'i', ['forearms']],
  ['incline-dumbbell-curl', 'Incline Dumbbell Curl', 'Incline Dumbbell Curl', 'arms', 'biceps', 'dumbbell', 'i'],
  ['preacher-curl', 'Preacher Curl', 'Preacher Curl', 'arms', 'biceps', 'ezbar', 'i'],
  ['concentration-curl', 'Concentration Curl', 'Concentration Curl', 'arms', 'biceps', 'dumbbell', 'i'],
  ['cable-curl', 'Kablo Curl', 'Cable Curl', 'arms', 'biceps', 'cable', 'i'],
  ['machine-curl', 'Biceps Curl Makinesi', 'Machine Biceps Curl', 'arms', 'biceps', 'machine', 'i'],
  ['triceps-pushdown', 'Triceps Pushdown', 'Cable Triceps Pushdown', 'arms', 'triceps', 'cable', 'i'],
  ['rope-pushdown', 'Halat Pushdown', 'Rope Triceps Pushdown', 'arms', 'triceps', 'cable', 'i'],
  ['overhead-cable-extension', 'Overhead Kablo Extension', 'Overhead Cable Triceps Extension', 'arms', 'triceps', 'cable', 'i'],
  ['skull-crusher', 'Skull Crusher', 'EZ-Bar Skull Crusher', 'arms', 'triceps', 'ezbar', 'i'],
  ['dumbbell-overhead-extension', 'Dumbbell Overhead Extension', 'Dumbbell Overhead Triceps Extension', 'arms', 'triceps', 'dumbbell', 'i'],
  ['close-grip-bench-press', 'Dar Tutuş Bench Press', 'Close-Grip Bench Press', 'arms', 'triceps', 'barbell', 'c', ['chest']],
  ['triceps-dips', 'Triceps Dips', 'Triceps Dips', 'arms', 'triceps', 'bodyweight', 'c', ['chest'], 'reps', 10],
  ['bench-dips', 'Bench Dips', 'Bench Dips', 'arms', 'triceps', 'bodyweight', 'i', [], 'reps', 12],
  ['triceps-kickback', 'Triceps Kickback', 'Dumbbell Triceps Kickback', 'arms', 'triceps', 'dumbbell', 'i'],
  ['wrist-curl', 'Wrist Curl', 'Wrist Curl', 'arms', 'forearms', 'dumbbell', 'i', [], 'weight_reps', 15],
  ['reverse-curl', 'Reverse Curl', 'Reverse Barbell Curl', 'arms', 'forearms', 'barbell', 'i', ['brachialis']],

  // Karın & Core
  ['plank', 'Plank', 'Plank', 'core', 'abs', 'bodyweight', 'i', [], 'duration', '45 sn'],
  ['side-plank', 'Side Plank', 'Side Plank', 'core', 'obliques', 'bodyweight', 'i', [], 'duration', '30 sn'],
  ['crunch', 'Crunch', 'Crunch', 'core', 'abs', 'bodyweight', 'i', [], 'reps', 20],
  ['cable-crunch', 'Kablo Crunch', 'Cable Crunch', 'core', 'abs', 'cable', 'i', [], 'weight_reps', 15],
  ['machine-crunch', 'Crunch Makinesi', 'Machine Crunch', 'core', 'abs', 'machine', 'i', [], 'weight_reps', 15],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'Hanging Leg Raise', 'core', 'abs', 'bodyweight', 'i', [], 'reps', 12],
  ['lying-leg-raise', 'Lying Leg Raise', 'Lying Leg Raise', 'core', 'abs', 'bodyweight', 'i', [], 'reps', 15],
  ['russian-twist', 'Russian Twist', 'Russian Twist', 'core', 'obliques', 'bodyweight', 'i', [], 'reps', 20],
  ['bicycle-crunch', 'Bicycle Crunch', 'Bicycle Crunch', 'core', 'obliques', 'bodyweight', 'i', [], 'reps', 20],
  ['ab-wheel', 'Ab Wheel Rollout', 'Ab Wheel Rollout', 'core', 'abs', 'other', 'i', [], 'reps', 10],
  ['mountain-climber', 'Mountain Climber', 'Mountain Climber', 'core', 'abs', 'bodyweight', 'c', [], 'duration', '30 sn'],
  ['dead-bug', 'Dead Bug', 'Dead Bug', 'core', 'abs', 'bodyweight', 'i', [], 'reps', 12],
  ['pallof-press', 'Pallof Press', 'Pallof Press', 'core', 'obliques', 'cable', 'i', [], 'weight_reps', 12],
  ['woodchopper', 'Woodchopper', 'Cable Woodchopper', 'core', 'obliques', 'cable', 'c', [], 'weight_reps', 12],

  // Tüm vücut & kondisyon
  ['burpee', 'Burpee', 'Burpee', 'fullbody', 'fullbody', 'bodyweight', 'c', [], 'reps', 12],
  ['clean-and-press', 'Clean & Press', 'Barbell Clean and Press', 'fullbody', 'fullbody', 'barbell', 'c', [], 'weight_reps', 6],
  ['thruster', 'Thruster', 'Dumbbell Thruster', 'fullbody', 'fullbody', 'dumbbell', 'c', [], 'weight_reps', 10],
  ['farmers-walk', 'Farmer Walk', "Farmer's Walk", 'fullbody', 'forearms', 'dumbbell', 'c', ['traps', 'core'], 'distance', '30 m'],
  ['jumping-jack', 'Jumping Jack', 'Jumping Jack', 'fullbody', 'fullbody', 'bodyweight', 'c', [], 'duration', '45 sn'],
  ['box-jump', 'Box Jump', 'Box Jump', 'fullbody', 'quads', 'other', 'c', ['glutes'], 'reps', 10],
  ['battle-rope', 'Battle Rope', 'Battle Rope', 'fullbody', 'shoulders', 'other', 'c', [], 'duration', '30 sn'],
  ['treadmill-run', 'Koşu Bandı', 'Treadmill Run', 'fullbody', 'cardio', 'cardio', 'c', [], 'duration', '20 dk'],
  ['incline-walk', 'Eğimli Yürüyüş', 'Incline Treadmill Walk', 'fullbody', 'cardio', 'cardio', 'c', [], 'duration', '20 dk'],
  ['stationary-bike', 'Kondisyon Bisikleti', 'Stationary Bike', 'fullbody', 'cardio', 'cardio', 'c', [], 'duration', '20 dk'],
  ['elliptical', 'Eliptik Bisiklet', 'Elliptical', 'fullbody', 'cardio', 'cardio', 'c', [], 'duration', '20 dk'],
  ['rowing-machine', 'Kürek Makinesi', 'Rowing Machine', 'fullbody', 'cardio', 'cardio', 'c', ['back'], 'distance', '1000 m'],
  ['stair-climber', 'Merdiven Makinesi', 'Stair Climber', 'fullbody', 'cardio', 'cardio', 'c', ['glutes'], 'duration', '15 dk'],
  ['jump-rope', 'İp Atlama', 'Jump Rope', 'fullbody', 'cardio', 'other', 'c', ['calves'], 'duration', '2 dk'],
  ['band-pull-apart', 'Band Pull Apart', 'Band Pull-Apart', 'shoulders', 'rear_delts', 'band', 'i', ['upper_back'], 'reps', 20],
  ['band-squat', 'Bantlı Squat', 'Banded Squat', 'legs', 'quads', 'band', 'c', ['glutes'], 'reps', 15],
  ['kettlebell-goblet-squat', 'Kettlebell Goblet Squat', 'Kettlebell Goblet Squat', 'legs', 'quads', 'kettlebell', 'c', ['glutes']],
  ['turkish-get-up', 'Turkish Get-up', 'Turkish Get-up', 'fullbody', 'fullbody', 'kettlebell', 'c', ['core', 'shoulders'], 'weight_reps', 5],
];

const DEFAULT_REST: Record<'c' | 'i', number> = { c: 90, i: 60 };

export const SYSTEM_EXERCISES: CatalogExercise[] = ROWS.map(
  ([slug, name, nameEn, muscleGroup, primaryMuscle, equipment, mechanic, secondary = [], tracking = 'weight_reps', reps]) => ({
    id: `sys-ex-${slug}`,
    source: 'system',
    name,
    nameEn,
    muscleGroup,
    primaryMuscle,
    secondaryMuscles: secondary,
    equipment,
    equipmentName: EQUIPMENT_LABELS[equipment],
    mechanic: mechanic === 'c' ? 'compound' : 'isolation',
    trackingType: tracking,
    defaultSets: tracking === 'weight_reps' && mechanic === 'c' ? 4 : 3,
    defaultReps: reps ?? (mechanic === 'c' ? 10 : 12),
    defaultRestSeconds: tracking === 'duration' || tracking === 'distance' ? 45 : DEFAULT_REST[mechanic],
    instructions: [],
    imageUrl: null,
  }),
);

export const SYSTEM_EXERCISE_IDS = new Set(SYSTEM_EXERCISES.map((exercise) => exercise.id));

export function isSystemExerciseId(id: string): boolean {
  return id.startsWith('sys-ex-');
}

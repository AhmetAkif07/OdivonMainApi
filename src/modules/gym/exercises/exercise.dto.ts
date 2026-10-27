import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { EQUIPMENT, MUSCLE_GROUPS, TRACKING_TYPES } from './system-exercises';

export class ExerciseQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsIn(MUSCLE_GROUPS)
  muscleGroup?: string;

  @IsOptional()
  @IsIn(EQUIPMENT)
  equipment?: string;

  @IsOptional()
  @IsIn(['system', 'gym', 'member'])
  source?: 'system' | 'gym' | 'member';
}

/** A gym's own exercise (panel) or a member's private one (mobile). */
export class CreateExerciseDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @IsIn(MUSCLE_GROUPS)
  muscleGroup!: (typeof MUSCLE_GROUPS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  primaryMuscle?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  secondaryMuscles?: string[];

  @IsIn(EQUIPMENT)
  equipment!: (typeof EQUIPMENT)[number];

  /** Free text shown on plans, e.g. "Hammer Strength Row"; defaults to the equipment label. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  equipmentName?: string;

  @IsOptional()
  @IsIn(['compound', 'isolation'])
  mechanic?: 'compound' | 'isolation';

  @IsOptional()
  @IsIn(TRACKING_TYPES)
  trackingType?: (typeof TRACKING_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  defaultSets?: number;

  @IsOptional()
  defaultReps?: number | string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900)
  defaultRestSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  instructions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;
}

export class UpdateExerciseDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  nameEn?: string;

  @IsOptional()
  @IsIn(MUSCLE_GROUPS)
  muscleGroup?: (typeof MUSCLE_GROUPS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(50)
  primaryMuscle?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  secondaryMuscles?: string[];

  @IsOptional()
  @IsIn(EQUIPMENT)
  equipment?: (typeof EQUIPMENT)[number];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  equipmentName?: string;

  @IsOptional()
  @IsIn(['compound', 'isolation'])
  mechanic?: 'compound' | 'isolation';

  @IsOptional()
  @IsIn(TRACKING_TYPES)
  trackingType?: (typeof TRACKING_TYPES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  defaultSets?: number;

  @IsOptional()
  defaultReps?: number | string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(900)
  defaultRestSeconds?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  instructions?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  imageUrl?: string | null;
}

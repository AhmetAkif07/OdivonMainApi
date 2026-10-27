import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class PatchMobileMeDto {
  @IsOptional()
  @IsString()
  photoURL?: string | null;

  @IsOptional()
  @IsString()
  phone?: string | null;

  @IsOptional()
  @IsString()
  emergencyContactName?: string | null;

  @IsOptional()
  @IsString()
  emergencyContactPhone?: string | null;

  @IsOptional()
  @IsString()
  emergencyContactRelation?: string | null;

  @IsOptional()
  @IsString()
  language?: string | null;

  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;

  /** Weekly workout goal shown on the app dashboard ring. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weeklyWorkoutTarget?: number;
}

export class WorkoutLogSetDto {
  @IsNumber()
  @Min(1)
  setIndex!: number;

  @IsNumber()
  @Min(0)
  kg!: number;

  @IsNumber()
  @Min(0)
  reps!: number;

  @IsOptional()
  @IsBoolean()
  completed?: boolean;
}

export class CreateWorkoutLogDto {
  @IsString()
  planId!: string;

  @IsString()
  exerciseName!: string;

  @IsOptional()
  @IsString()
  exerciseId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WorkoutLogSetDto)
  sets!: WorkoutLogSetDto[];

  @IsOptional()
  @IsString()
  performedAt?: string;
}

export class StartWorkoutSessionDto {
  @IsString()
  sessionId!: string;

  @IsString()
  planId!: string;

  @IsString()
  startedAt!: string;

  /** The plan day being trained (`days[].id`); lets the app suggest the next day. */
  @IsOptional()
  @IsString()
  dayId?: string;
}

export class CompleteWorkoutSessionSetDto {
  @IsString()
  exerciseName!: string;

  @IsOptional()
  @IsString()
  exerciseId?: string;

  @IsInt()
  @Min(1)
  index!: number;

  @IsNumber()
  @Min(0)
  weight!: number;

  @IsInt()
  @Min(0)
  reps!: number;

  @IsIn(['pending', 'completed', 'skipped'])
  status!: 'pending' | 'completed' | 'skipped';

  @IsOptional()
  @IsString()
  completedAt?: string;
}

export class CompleteWorkoutSessionDto {
  @IsString()
  startedAt!: string;

  @IsString()
  completedAt!: string;

  @IsInt()
  @Min(0)
  pausedDurationMs!: number;

  @IsInt()
  @Min(0)
  restDurationMs!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompleteWorkoutSessionSetDto)
  sets!: CompleteWorkoutSessionSetDto[];
}

export class CancelMobileAppointmentDto {
  @IsOptional()
  @IsString()
  cancellationReason?: string;
}

export class CreateMobileAppointmentDto {
  @IsString()
  appointmentTime!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Reschedule of the member's own booked appointment; the trainer stays the same. */
export class UpdateMobileAppointmentDto {
  @IsOptional()
  @IsString()
  appointmentTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(15)
  duration?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** A plan the member writes for themselves (`/gym/mobile/workout-plans`). */
export class MemberWorkoutPlanDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string | null;

  @IsOptional()
  @IsIn(['active', 'paused', 'completed', 'archived'])
  status?: 'active' | 'paused' | 'completed' | 'archived';

  @IsOptional()
  @IsString()
  disciplineId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  exercises?: Record<string, unknown>[];

  /** Structured days; when sent it replaces `exercises` (which is then derived from it). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(14)
  days?: Record<string, unknown>[];
}

/** Also the PATCH body of `/gym/mobile/measurements/:id`: every field is optional. */
export class CreateMeasurementDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsNumber()
  weight?: number;

  @IsOptional()
  @IsNumber()
  height?: number;

  @IsOptional()
  @IsNumber()
  chest?: number;

  @IsOptional()
  @IsNumber()
  waist?: number;

  @IsOptional()
  @IsNumber()
  hips?: number;

  @IsOptional()
  @IsNumber()
  bicep?: number;

  @IsOptional()
  @IsNumber()
  thigh?: number;

  @IsOptional()
  @IsNumber()
  calf?: number;

  @IsOptional()
  @IsNumber()
  bodyFatPercentage?: number;

  @IsOptional()
  @IsNumber()
  muscleMassKg?: number;

  @IsOptional()
  @IsNumber()
  rightBicep?: number;

  @IsOptional()
  @IsNumber()
  leftBicep?: number;

  @IsOptional()
  @IsNumber()
  rightThigh?: number;

  @IsOptional()
  @IsNumber()
  leftThigh?: number;

  @IsOptional()
  @IsNumber()
  rightCalf?: number;

  @IsOptional()
  @IsNumber()
  leftCalf?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateProgressPhotoDto {
  @IsIn(['front', 'side', 'back'])
  pose!: 'front' | 'side' | 'back';

  @IsString()
  storagePath!: string;

  @IsOptional()
  @IsString()
  contentType?: string;

  @IsOptional()
  @IsString()
  takenAt?: string;
}

export class CreateWaterLogDto {
  @IsNumber()
  @Min(1)
  amountMl!: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWaterLogDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  amountMl?: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class WaterQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

export class CreateMealLogDto {
  @IsInt()
  @Min(0)
  mealIndex!: number;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  date?: string;
}

export class SendMessageDto {
  @IsString()
  body!: string;
}

export class RenewMembershipDto {
  @IsString()
  packageId!: string;
}

export class PaymentIntentDto {
  @IsString()
  packageId!: string;

  @IsOptional()
  @IsString()
  provider?: string;
}

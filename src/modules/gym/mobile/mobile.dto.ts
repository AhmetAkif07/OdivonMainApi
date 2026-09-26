import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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

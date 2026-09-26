import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
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

import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  DIET_ACTIVITY_LEVELS,
  DIET_CHANNELS,
  DIET_CLIENT_STATUSES,
  DIET_CONSULTATION_STATUSES,
  DIET_DEVICE_PLATFORMS,
  DIET_PLAN_STATUSES,
  DIET_PROGRAMS,
  DIET_REQUEST_STATUSES,
  DIET_REQUEST_TYPES,
  DIET_SEXES,
  DIET_TASK_CATEGORIES,
} from './diet.types';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class DietAttachmentDto {
  @IsString() @Length(1, 120) id!: string;
  @IsString() @Length(1, 200) name!: string;
  @IsString() @Length(1, 120) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(0) @Max(50_000_000) sizeBytes!: number;
  @IsIn(['image', 'file']) kind!: 'image' | 'file';
  @IsString() @Length(1, 2000) url!: string;
}

// ---------- Clients ----------

export class CreateDietClientDto {
  @IsString() @Length(1, 80) firstName!: string;
  @IsString() @Length(1, 80) lastName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsIn(DIET_SEXES) sex!: (typeof DIET_SEXES)[number];
  @Type(() => Number) @IsNumber() @Min(50) @Max(250) heightCm!: number;
  @Type(() => Number) @IsNumber() @Min(10) @Max(400) startWeightKg!: number;
  @Type(() => Number) @IsNumber() @Min(10) @Max(400) targetWeightKg!: number;
  @IsOptional() @IsIn(DIET_ACTIVITY_LEVELS) activity?: (typeof DIET_ACTIVITY_LEVELS)[number];
  @IsOptional() @IsIn(DIET_PROGRAMS) program?: (typeof DIET_PROGRAMS)[number];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) conditions?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) allergies?: string[];
  @IsOptional() @IsDateString() consentAt?: string;
  @IsOptional() @IsIn(DIET_CLIENT_STATUSES) status?: (typeof DIET_CLIENT_STATUSES)[number];
  @IsOptional() @IsString() @Length(1, 128) dietitianId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(20) @Max(300) waistCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(20) @Max(300) hipCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(80) bodyFatPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(10) waterTargetL?: number;
  @IsOptional() @IsString() @MaxLength(5000) clinicalNotes?: string;
}

export class UpdateDietClientDto extends PartialType(CreateDietClientDto) {}

export class ListDietClientsQueryDto {
  @IsOptional() @IsIn(DIET_CLIENT_STATUSES) status?: (typeof DIET_CLIENT_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(80) search?: string;
  @IsOptional() @IsString() @MaxLength(128) dietitianId?: string;
}

// ---------- Measurements ----------

export class CreateDietMeasurementDto {
  @IsOptional() @IsDateString() date?: string;
  @Type(() => Number) @IsNumber() @Min(10) @Max(400) weightKg!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(20) @Max(300) waistCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(20) @Max(300) hipCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(80) bodyFatPct?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(200) muscleMassKg?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(60) visceralFatRating?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(10) @Max(90) bodyWaterPct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(120) metabolicAge?: number;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

// ---------- Consultations ----------

export class CreateDietConsultationDto {
  @IsString() @Length(1, 128) clientId!: string;
  @IsDateString() at!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(5) @Max(480) durationMin?: number;
  @IsIn(DIET_CHANNELS) channel!: (typeof DIET_CHANNELS)[number];
  @IsOptional() @IsIn(DIET_CONSULTATION_STATUSES) status?: (typeof DIET_CONSULTATION_STATUSES)[number];
  @IsOptional() @IsString() @Length(1, 128) dietitianId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) adherence?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
  @IsOptional() @IsString() @MaxLength(1000) nextAction?: string;
}

export class UpdateDietConsultationDto extends PartialType(CreateDietConsultationDto) {}

export class ListDietConsultationsQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsOptional() @IsString() @MaxLength(128) dietitianId?: string;
  @IsOptional() @IsIn(DIET_CONSULTATION_STATUSES) status?: (typeof DIET_CONSULTATION_STATUSES)[number];
}

// ---------- Plans ----------

export class DietMealDto {
  @IsString() @Length(1, 80) name!: string;
  @Matches(TIME) time!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(10000) kcal!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) proteinG?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) carbG?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fatG?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fiberG?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsObject({ each: true }) items?: Record<string, unknown>[];
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}

export class CreateDietPlanDto {
  @IsString() @Length(1, 128) clientId!: string;
  @IsString() @Length(1, 160) title!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @Type(() => Number) @IsNumber() @Min(0) @Max(10000) kcal!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) proteinPct!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) carbPct!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) fatPct!: number;
  @IsOptional() @IsArray() @ArrayMaxSize(12) @ValidateNested({ each: true }) @Type(() => DietMealDto) meals?: DietMealDto[];
  @IsOptional() @IsIn(DIET_PLAN_STATUSES) status?: (typeof DIET_PLAN_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class UpdateDietPlanDto extends PartialType(CreateDietPlanDto) {}

export class ListDietPlansQueryDto {
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsOptional() @IsIn(DIET_PLAN_STATUSES) status?: (typeof DIET_PLAN_STATUSES)[number];
}

// ---------- Messages ----------

export class SendDietMessageDto {
  @IsOptional() @IsString() @MaxLength(4000) body?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => DietAttachmentDto) attachments?: DietAttachmentDto[];
}

export class ListDietMessagesQueryDto {
  @IsOptional() @IsDateString() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

// ---------- Tasks ----------

export class CreateDietTaskDto {
  @IsString() @Length(1, 160) title!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsIn(DIET_TASK_CATEGORIES) category!: (typeof DIET_TASK_CATEGORIES)[number];
  @IsOptional() @IsDateString() dueDate?: string;
}

export class UpdateDietTaskDto extends PartialType(CreateDietTaskDto) {
  @IsOptional() @IsIn(['open', 'done']) status?: 'open' | 'done';
}

export class ListDietTasksQueryDto {
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
  @IsOptional() @IsIn(['open', 'done']) status?: 'open' | 'done';
}

// ---------- Requests ----------

export class CreateDietRequestDto {
  @IsString() @Length(1, 128) clientId!: string;
  @IsIn(DIET_REQUEST_TYPES) type!: (typeof DIET_REQUEST_TYPES)[number];
  @IsString() @Length(1, 160) subject!: string;
  @IsOptional() @IsString() @MaxLength(4000) detail?: string;
  @IsOptional() @IsDateString() preferredDate?: string;
  @IsOptional() @Matches(TIME) preferredTime?: string;
  @IsOptional() @IsIn(DIET_CHANNELS) preferredChannel?: (typeof DIET_CHANNELS)[number];
}

export class UpdateDietRequestDto {
  @IsOptional() @IsIn(DIET_REQUEST_STATUSES) status?: (typeof DIET_REQUEST_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(4000) response?: string;
}

export class ListDietRequestsQueryDto {
  @IsOptional() @IsIn(DIET_REQUEST_STATUSES) status?: (typeof DIET_REQUEST_STATUSES)[number];
  @IsOptional() @IsString() @MaxLength(128) clientId?: string;
}

// ---------- Devices & notifications ----------

export class RegisterDietDeviceDto {
  @IsString() @Length(10, 4096) token!: string;
  @IsIn(DIET_DEVICE_PLATFORMS) platform!: (typeof DIET_DEVICE_PLATFORMS)[number];
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}

export class UnregisterDietDeviceDto {
  @IsString() @Length(10, 4096) token!: string;
}

export class UpdateDietNotificationPrefsDto {
  @IsOptional() @IsBoolean() messages?: boolean;
  @IsOptional() @IsBoolean() requests?: boolean;
  @IsOptional() @IsBoolean() tasks?: boolean;
  @IsOptional() @IsBoolean() consultationReminders?: boolean;
  @IsOptional() @IsBoolean() billing?: boolean;
  @IsOptional() @Matches(TIME) quietHoursStart?: string | null;
  @IsOptional() @Matches(TIME) quietHoursEnd?: string | null;
}

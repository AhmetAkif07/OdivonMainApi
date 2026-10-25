import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export const FGAS_EQUIPMENT_TYPES = [
  'stationary-refrigeration',
  'air-conditioning',
  'heat-pump',
  'transport-refrigeration',
  'fire-protection',
  'switchgear',
  'other',
] as const;
export const FGAS_RECORD_STATUSES = ['active', 'action-required', 'out-of-service'] as const;
export const FGAS_INSPECTION_INTERVALS = [3, 6, 12, 24] as const;

export class CreateFgasRecordDto {
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 80) location!: string;
  @IsOptional() @IsString() @Length(1, 80) equipmentCode?: string;
  @IsIn(FGAS_EQUIPMENT_TYPES) equipmentType!: (typeof FGAS_EQUIPMENT_TYPES)[number];
  @IsOptional() @IsString() @Length(1, 120) manufacturer?: string;
  @IsOptional() @IsString() @Length(1, 120) model?: string;
  @IsOptional() @IsString() @Length(1, 120) serialNumber?: string;
  @IsOptional() @IsString() @Length(1, 80) refrigerant?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100000)
  refrigerantChargeKg?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000000)
  co2EquivalentTonnes?: number;
  @IsOptional() @IsBoolean() hermeticallySealed?: boolean;
  @IsOptional() @IsBoolean() leakDetectionSystem?: boolean;
  @IsOptional() @IsDateString() installationDate?: string;
  @IsOptional() @IsDateString() lastLeakCheckAt?: string;
  @IsOptional() @IsDateString() nextLeakCheckDueAt?: string;
  @IsOptional() @IsString() @Length(1, 120) responsiblePerson?: string;
  @IsOptional()
  @Type(() => Number)
  @IsIn(FGAS_INSPECTION_INTERVALS)
  inspectionIntervalMonths?: (typeof FGAS_INSPECTION_INTERVALS)[number];
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
  @IsOptional() @IsIn(FGAS_RECORD_STATUSES) status?: (typeof FGAS_RECORD_STATUSES)[number];
}

export class UpdateFgasRecordDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @Length(2, 80) location?: string;
  @IsOptional() @IsString() @Length(1, 80) equipmentCode?: string;
  @IsOptional() @IsIn(FGAS_EQUIPMENT_TYPES) equipmentType?: (typeof FGAS_EQUIPMENT_TYPES)[number];
  @IsOptional() @IsString() @Length(1, 120) manufacturer?: string;
  @IsOptional() @IsString() @Length(1, 120) model?: string;
  @IsOptional() @IsString() @Length(1, 120) serialNumber?: string;
  @IsOptional() @IsString() @Length(1, 80) refrigerant?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100000)
  refrigerantChargeKg?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(1000000)
  co2EquivalentTonnes?: number;
  @IsOptional() @IsBoolean() hermeticallySealed?: boolean;
  @IsOptional() @IsBoolean() leakDetectionSystem?: boolean;
  @IsOptional() @IsDateString() installationDate?: string;
  @IsOptional() @IsDateString() lastLeakCheckAt?: string;
  @IsOptional() @IsDateString() nextLeakCheckDueAt?: string;
  @IsOptional() @IsString() @Length(1, 120) responsiblePerson?: string;
  @IsOptional()
  @Type(() => Number)
  @IsIn(FGAS_INSPECTION_INTERVALS)
  inspectionIntervalMonths?: (typeof FGAS_INSPECTION_INTERVALS)[number];
  @IsOptional() @IsString() @Length(1, 2000) notes?: string;
  @IsOptional() @IsIn(FGAS_RECORD_STATUSES) status?: (typeof FGAS_RECORD_STATUSES)[number];
}

export class FgasListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived = false;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() cursor?: string;
}

import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsEmail,
  IsArray,
  Length,
  Max,
  Min,
} from 'class-validator';
import { FgasOperationKind } from './fgas.types';
import { PartialType } from '@nestjs/swagger';

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

export const FGAS_OPERATION_KINDS = [
  'leak-check',
  'gas-movement',
  'technician',
  'inspection',
] as const;
export const FGAS_OPERATION_STATUSES = [
  'draft',
  'scheduled',
  'completed',
  'action-required',
  'expired',
] as const;

export class CreateFgasOperationDto {
  @IsString() @Length(2, 160) title!: string;
  @IsOptional() @IsString() @Length(1, 80) reference?: string;
  @IsOptional() @IsString() @Length(1, 128) equipmentId?: string;
  @IsOptional() @IsString() @Length(1, 120) location?: string;
  @IsOptional() @IsDateString() occurredAt?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsIn(FGAS_OPERATION_STATUSES) status?: (typeof FGAS_OPERATION_STATUSES)[number];
  @IsOptional() @IsString() @Length(1, 128) technicianId?: string;
  @IsOptional() @IsString() @Length(1, 120) technicianName?: string;
  @IsOptional() @IsString() @Length(1, 80) certificateNumber?: string;
  @IsOptional() @IsString() @Length(1, 80) certificateCategory?: string;
  @IsOptional() @IsDateString() certificateExpiresAt?: string;
  @IsOptional() @IsString() @Length(1, 80) refrigerant?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  @Max(100000)
  quantityKg?: number;
  @IsOptional() @IsIn(['charge', 'recovery', 'transfer', 'disposal']) movementType?:
    'charge' | 'recovery' | 'transfer' | 'disposal';
  @IsOptional() @IsIn(['pass', 'conditional', 'fail']) result?: 'pass' | 'conditional' | 'fail';
  @IsOptional() @IsBoolean() leakDetected?: boolean;
  @IsOptional() @IsBoolean() repairRequired?: boolean;
  @IsOptional() @IsDateString() followUpDueAt?: string;
  @IsOptional() @IsString() @Length(1, 4000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) evidenceRefs?: string[];
}

export class UpdateFgasOperationDto extends PartialType(CreateFgasOperationDto) {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class FgasOperationListQueryDto extends FgasListQueryDto {
  @IsOptional() @IsIn(FGAS_OPERATION_STATUSES) status?: (typeof FGAS_OPERATION_STATUSES)[number];
}

export class FgasOperationKindDto {
  @IsIn(FGAS_OPERATION_KINDS) kind!: FgasOperationKind;
}

export class CompleteFgasOnboardingDto {
  @IsString() @Length(2, 160) legalName!: string;
  @IsOptional() @IsString() @Length(5, 32) taxNumber?: string;
  @IsString() @Length(2, 80) primaryLocation!: string;
  @IsIn(['TR', 'EU', 'UK', 'other']) regulatoryRegion!: 'TR' | 'EU' | 'UK' | 'other';
  @IsString() @Length(2, 80) country!: string;
  @IsString() @Length(3, 80) timezone!: string;
  @IsString() @Length(2, 120) contactName!: string;
  @IsEmail() contactEmail!: string;
  @IsOptional() @IsString() @Length(5, 40) contactPhone?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(12) reportingYearStartMonth!: number;
}

import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsISO8601,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { FIRE_SAFE_RECORD_KINDS } from './fire-safe.constants';
import { FireSafeRecordKind, FireSafeRecordStatus } from './fire-safe.types';

const STATUSES: readonly FireSafeRecordStatus[] = [
  'active',
  'pending',
  'completed',
  'action-required',
  'closed',
];

export class CreateFireSafeRecordDto {
  @IsIn(FIRE_SAFE_RECORD_KINDS) kind!: FireSafeRecordKind;
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 80) location!: string;
  @IsOptional() @IsString() @Length(1, 80) facilityCode?: string;
  @IsOptional() @IsISO8601() inspectionDueAt?: string;
  @IsOptional() @IsString() @Length(1, 80) code?: string;
  @IsOptional() @IsString() @Length(1, 80) category?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical']) riskLevel?:
    'low' | 'medium' | 'high' | 'critical';
  @IsOptional() @IsString() @Length(2, 120) responsibleName?: string;
  @IsOptional() @IsISO8601() completedAt?: string;
  @IsOptional() @IsIn(['pass', 'conditional', 'fail']) result?: 'pass' | 'conditional' | 'fail';
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) documentRefs?: string[];
  @IsOptional() @IsIn(STATUSES) status?: FireSafeRecordStatus;
}

export class UpdateFireSafeRecordDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsIn(FIRE_SAFE_RECORD_KINDS) kind?: FireSafeRecordKind;
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @Length(2, 80) location?: string;
  @IsOptional() @IsString() @Length(1, 80) facilityCode?: string;
  @IsOptional() @IsISO8601() inspectionDueAt?: string;
  @IsOptional() @IsString() @Length(1, 80) code?: string;
  @IsOptional() @IsString() @Length(1, 80) category?: string;
  @IsOptional() @IsIn(['low', 'medium', 'high', 'critical']) riskLevel?:
    'low' | 'medium' | 'high' | 'critical';
  @IsOptional() @IsString() @Length(2, 120) responsibleName?: string;
  @IsOptional() @IsISO8601() completedAt?: string;
  @IsOptional() @IsIn(['pass', 'conditional', 'fail']) result?: 'pass' | 'conditional' | 'fail';
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) documentRefs?: string[];
  @IsOptional() @IsIn(STATUSES) status?: FireSafeRecordStatus;
}

export class FireSafeListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(FIRE_SAFE_RECORD_KINDS) kind?: FireSafeRecordKind;
  @IsOptional() @IsIn(STATUSES) status?: FireSafeRecordStatus;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived = false;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() cursor?: string;
}

export class CompleteFireSafeOnboardingDto {
  @IsString() @Length(2, 160) legalName!: string;
  @IsOptional() @IsString() @Length(5, 32) taxNumber?: string;
  @IsString() @Length(2, 80) primaryFacility!: string;
  @IsString() @Length(2, 80) country!: string;
  @IsString() @Length(3, 80) timezone!: string;
  @IsString() @Length(2, 120) safetyManagerName!: string;
  @IsEmail() safetyManagerEmail!: string;
  @IsOptional() @IsString() @Length(5, 40) safetyManagerPhone?: string;
  @IsOptional() @IsString() @Length(2, 120) authorityName?: string;
  @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(10000) employeeCount!: number;
}

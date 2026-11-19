import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MACHINE_CE_RECORD_KINDS } from './machine-ce.constants';
import { MachineCeRecordKind, MachineCeRecordStatus } from './machine-ce.types';

const STATUSES: readonly MachineCeRecordStatus[] = [
  'draft',
  'in-review',
  'action-required',
  'approved',
  'rejected',
];

export class CreateMachineCeRecordDto {
  @IsIn(MACHINE_CE_RECORD_KINDS) kind!: MachineCeRecordKind;
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 120) location!: string;
  @IsOptional() @IsString() @Length(1, 120) manufacturer?: string;
  @IsOptional() @IsString() @Length(1, 120) model?: string;
  @IsOptional() @IsString() @Length(1, 120) serialNumber?: string;
  @IsOptional() @IsString() @Length(1, 120) machineType?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  manufactureYear?: number | null;
  @IsOptional() @IsString() @Length(1, 160) directive?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) standardRefs?: string[];
  @IsOptional() @IsString() @Length(0, 4000) hazard?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  severity?: number | null;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  probability?: number | null;
  @IsOptional() @IsString() @Length(0, 4000) protectiveMeasures?: string;
  @IsOptional() @IsString() @Length(0, 4000) residualRisk?: string;
  @IsOptional() @IsString() @Length(2, 120) responsibleName?: string;
  @IsOptional() @IsString() assessmentDueAt?: string;
  @IsOptional() @IsString() approvedAt?: string;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) documentRefs?: string[];
  @IsOptional() @IsIn(STATUSES) status?: MachineCeRecordStatus;
}

export class UpdateMachineCeRecordDto extends PartialType(CreateMachineCeRecordDto) {
  @IsInt() @Min(1) expectedVersion!: number;
}

export class MachineCeListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(MACHINE_CE_RECORD_KINDS) kind?: MachineCeRecordKind;
  @IsOptional() @IsIn(STATUSES) status?: MachineCeRecordStatus;
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  archived = false;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 100;
  @IsOptional() @IsString() cursor?: string;
}

export class CompleteMachineCeOnboardingDto {
  @IsString() @Length(2, 160) legalName!: string;
  @IsOptional() @IsString() @Length(0, 40) taxNumber?: string;
  @IsString() @Length(2, 120) productionSite!: string;
  @IsString() @Length(2, 80) country!: string;
  @IsString() @Length(3, 80) timezone!: string;
  @IsString() @Length(2, 120) regulatoryContactName!: string;
  @IsEmail() regulatoryContactEmail!: string;
  @IsOptional() @IsString() @Length(0, 40) regulatoryContactPhone?: string;
  @IsArray() @IsString({ each: true }) targetMarkets!: string[];
}

export class UploadMachineCeAttachmentDto {
  @IsString() @Length(1, 200) name!: string;
  @IsString() @Length(1, 80) category!: string;
  @IsString() @Length(3, 120) mimeType!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(900_000) size!: number;
  @IsString() @Length(10, 1_300_000) dataUrl!: string;
  @IsOptional() @IsString() @Length(1, 80) refCode?: string;
}

export class BulkCreateMachineCeRecordsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateMachineCeRecordDto)
  items!: CreateMachineCeRecordDto[];
}

export class AiAnalyzeMachineDto {
  @IsString() @Length(2, 200) name!: string;
  @IsOptional() @IsString() @Length(0, 140) machineType?: string;
  @IsOptional() @IsString() @Length(0, 140) location?: string;
  @IsOptional() @IsString() @Length(0, 1000) hazardHint?: string;
}

export class AiCopilotAskDto {
  @IsString() @Length(3, 1500) question!: string;
  @IsOptional() @IsString() @Length(0, 160) contextMachineName?: string;
}

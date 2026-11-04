import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { SURGERY_STATUSES, SurgeryStatus } from './surgery.entity';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class SurgeryAnesthesiaDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  asaClass?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  emergency?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  protocol?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  agents?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  monitoring?: string | null;
}

export class SurgeryTimesDto {
  @ApiPropertyOptional({ example: '09:30' })
  @IsOptional()
  @Matches(TIME)
  anesthesiaStart?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TIME)
  surgeryStart?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TIME)
  surgeryEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(TIME)
  recoveryEnd?: string | null;
}

export class SurgeryChecklistItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  key!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label!: string;

  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

export class CreateSurgeryDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(DATE)
  date!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  examinationId?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  surgeonId?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  assistantIds?: string[];

  @ApiPropertyOptional({ type: SurgeryAnesthesiaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SurgeryAnesthesiaDto)
  anesthesia?: SurgeryAnesthesiaDto;

  @ApiPropertyOptional({ type: SurgeryTimesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SurgeryTimesDto)
  times?: SurgeryTimesDto;

  @ApiPropertyOptional({ type: [SurgeryChecklistItemDto], description: 'Defaults to the standard pre-op checklist' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SurgeryChecklistItemDto)
  checklist?: SurgeryChecklistItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  complications?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  postOpNotes?: string | null;

  @ApiPropertyOptional({ enum: SURGERY_STATUSES, default: 'planned' })
  @IsOptional()
  @IsIn(SURGERY_STATUSES)
  status?: SurgeryStatus;
}

export class UpdateSurgeryDto extends PartialType(CreateSurgeryDto) {}

export class SurgeryQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional({ enum: SURGERY_STATUSES })
  @IsOptional()
  @IsIn(SURGERY_STATUSES)
  status?: SurgeryStatus;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DATE)
  to?: string;
}

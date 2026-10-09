import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EXAMINATION_STATUSES, ExaminationStatus } from '../entities/examination.entity';

export class ExaminationVitalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pulse?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;
}

export class CreateExaminationDto {
  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiPropertyOptional({ type: ExaminationVitalsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExaminationVitalsDto)
  vitals?: ExaminationVitalsDto;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  symptoms?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complaint?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bundleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bundleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  deductStock?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  treatmentItems?: Array<{ name: string; quantity: number; unit?: string; notes?: string; price?: number }>;

  @ApiPropertyOptional({ enum: EXAMINATION_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn(EXAMINATION_STATUSES)
  status?: ExaminationStatus;
}

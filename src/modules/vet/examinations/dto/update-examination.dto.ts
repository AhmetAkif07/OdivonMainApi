import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { EXAMINATION_STATUSES, ExaminationStatus } from '../entities/examination.entity';
import { ExaminationVitalsDto } from './create-examination.dto';

export class UpdateExaminationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  date?: string;

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

  @ApiPropertyOptional({ enum: EXAMINATION_STATUSES })
  @IsOptional()
  @IsIn(EXAMINATION_STATUSES)
  status?: ExaminationStatus;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { HOSPITALIZATION_STATUSES, HospitalizationStatus } from '../entities/hospitalization.entity';

export class UpdateHospitalizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  admittedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedDischargeAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  actualDischargeAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  dailyCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentNotes?: string;

  @ApiPropertyOptional({ enum: HOSPITALIZATION_STATUSES })
  @IsOptional()
  @IsIn(HOSPITALIZATION_STATUSES)
  status?: HospitalizationStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saleId?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { CAGE_STATUSES, CAGE_TYPES, CageStatus, CageType } from '../entities/cage.entity';

export class UpdateCageDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: CAGE_TYPES })
  @IsOptional()
  @IsIn(CAGE_TYPES)
  type?: CageType;

  @ApiPropertyOptional({ enum: CAGE_STATUSES })
  @IsOptional()
  @IsIn(CAGE_STATUSES)
  status?: CageStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  dailyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentHospitalizationId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currentPatientName?: string | null;
}

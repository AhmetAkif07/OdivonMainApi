import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';
import { HOSPITALIZATION_STATUSES, HospitalizationStatus } from '../entities/hospitalization.entity';

export class CreateHospitalizationDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty()
  @IsString()
  cageId!: string;

  @ApiProperty()
  @IsISO8601()
  admittedAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  expectedDischargeAt?: string;

  @ApiProperty()
  @IsString()
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  diagnosis?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  doctorId?: string;

  @ApiPropertyOptional({ default: 350 })
  @IsOptional()
  @IsNumber()
  dailyCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  treatmentNotes?: string;

  @ApiPropertyOptional({ enum: HOSPITALIZATION_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(HOSPITALIZATION_STATUSES)
  status?: HospitalizationStatus;
}

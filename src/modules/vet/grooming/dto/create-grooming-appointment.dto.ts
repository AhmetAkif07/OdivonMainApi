import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  GROOMING_STATUSES,
  GROOMING_TEMPERAMENTS,
  GroomingStatus,
  GroomingTemperament,
} from '../entities/grooming-appointment.entity';

export class CreateGroomingAppointmentDto {
  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  time!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerPhone?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  patientId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  animalType?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientBreed?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  staffId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  serviceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceName?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  commissionRate?: number;

  @ApiPropertyOptional({ enum: GROOMING_STATUSES, default: 'waiting' })
  @IsOptional()
  @IsIn(GROOMING_STATUSES)
  status?: GroomingStatus;

  @ApiPropertyOptional({ enum: GROOMING_TEMPERAMENTS, default: 'calm' })
  @IsOptional()
  @IsIn(GROOMING_TEMPERAMENTS)
  temperament?: GroomingTemperament;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialNotes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  durationMinutes?: number;
}
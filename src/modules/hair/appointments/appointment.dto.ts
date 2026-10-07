import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { APPOINTMENT_STATUSES, AppointmentStatus } from '../shared/appointment-plan';
import { CLOCK, DATE_ID } from '../shared/hair-dto';

export const APPOINTMENT_SOURCES = ['walk-in', 'online', 'phone', 'receptionist'] as const;
export type AppointmentSource = (typeof APPOINTMENT_SOURCES)[number];

export class AppointmentServiceLineDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Performing staff of this line (R-013); default: appointment staffId' })
  @IsOptional()
  @IsString()
  staffId?: string;
}

export class SaveHairAppointmentDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({ description: 'Primary staff member' })
  @IsString()
  staffId!: string;

  @ApiProperty({ example: '2026-10-08', description: 'Local date in the salon time zone' })
  @Matches(DATE_ID)
  date!: string;

  @ApiProperty({ example: '14:00', description: 'Local start time' })
  @Matches(CLOCK)
  startTime!: string;

  @ApiProperty({ type: [AppointmentServiceLineDto], description: 'Performed back to back in this order' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AppointmentServiceLineDto)
  services!: AppointmentServiceLineDto[];

  @ApiPropertyOptional({ enum: APPOINTMENT_SOURCES, default: 'receptionist' })
  @IsOptional()
  @IsIn(APPOINTMENT_SOURCES)
  source?: AppointmentSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class SetHairAppointmentStatusDto {
  @ApiProperty({ enum: APPOINTMENT_STATUSES })
  @IsIn(APPOINTMENT_STATUSES)
  status!: AppointmentStatus;

  @ApiPropertyOptional({ description: 'Cancellation reason' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

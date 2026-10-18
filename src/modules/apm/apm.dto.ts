import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const APM_APPOINTMENT_STATUSES = ['Pending', 'Confirmed', 'InProgress', 'Completed', 'Cancelled'] as const;
export type ApmAppointmentStatus = (typeof APM_APPOINTMENT_STATUSES)[number];

export class SaveApmAppointmentDto {
  @ApiProperty({ example: 'Strateji görüşmesi' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: 'Ayşe Demir' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  customerName!: string;

  @ApiProperty({ example: 'Elif Yılmaz' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  staffName!: string;

  @ApiProperty({ description: 'UTC ISO 8601 start time' })
  @IsISO8601({ strict: true })
  startAt!: string;

  @ApiProperty({ description: 'UTC ISO 8601 end time, after startAt' })
  @IsISO8601({ strict: true })
  endAt!: string;

  @ApiPropertyOptional({ enum: APM_APPOINTMENT_STATUSES, default: 'Pending' })
  @IsOptional()
  @IsIn(APM_APPOINTMENT_STATUSES)
  status?: ApmAppointmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Structured APM branch id; omitted for legacy appointments.' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Structured APM service id; omitted for legacy appointments.' })
  @IsOptional()
  @IsString()
  serviceId?: string;

  @ApiPropertyOptional({ description: 'Structured APM staff id; omitted for legacy appointments.' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  customerEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  customerPhone?: string;

  @ApiPropertyOptional({ minimum: 15, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(480)
  durationMinutes?: number;
}

export class SetApmAppointmentStatusDto {
  @ApiProperty({ enum: APM_APPOINTMENT_STATUSES })
  @IsIn(APM_APPOINTMENT_STATUSES)
  status!: ApmAppointmentStatus;
}

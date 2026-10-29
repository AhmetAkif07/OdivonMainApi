import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { LEAVE_STATUSES, LEAVE_TYPES, LeaveStatus, LeaveType, SHIFT_TYPES, ShiftType } from './staff.entity';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ example: '2026-11-03' })
  @IsISO8601()
  date!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(TIME, { message: 'startTime HH:mm olmalı' })
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(TIME, { message: 'endTime HH:mm olmalı' })
  endTime!: string;

  @ApiPropertyOptional({ enum: SHIFT_TYPES, default: 'regular' })
  @IsOptional()
  @IsIn(SHIFT_TYPES)
  type?: ShiftType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class UpdateShiftDto extends PartialType(CreateShiftDto) {}

export class DateRangeQueryDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsISO8601()
  from!: string;

  @ApiProperty({ example: '2026-11-30' })
  @IsISO8601()
  to!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

export class CreateLeaveDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: LEAVE_TYPES })
  @IsIn(LEAVE_TYPES)
  type!: LeaveType;

  @ApiProperty()
  @IsISO8601()
  startDate!: string;

  @ApiProperty()
  @IsISO8601()
  endDate!: string;

  @ApiPropertyOptional({ description: 'Override the charged day count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class UpdateLeaveDto extends PartialType(CreateLeaveDto) {}

export class DecideLeaveDto {
  @ApiProperty({ enum: ['approved', 'rejected', 'cancelled'] })
  @IsIn(['approved', 'rejected', 'cancelled'])
  status!: Exclude<LeaveStatus, 'pending'>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class LeaveQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: LEAVE_STATUSES })
  @IsOptional()
  @IsIn(LEAVE_STATUSES)
  status?: LeaveStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

export class LeaveBalanceQueryDto {
  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

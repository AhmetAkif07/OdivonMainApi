import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CLOCK, DATE_ID } from '../shared/hair-dto';
import { HAIR_STAFF_ROLES, HairStaffRole } from '../shared/hair-roles';

export class WorkScheduleEntryDto {
  @ApiProperty({ description: '0 = Sunday' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty({ example: '09:00' })
  @Matches(CLOCK)
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(CLOCK)
  endTime!: string;
}

export class CreateHairStaffDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @Length(0, 80)
  lastName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional({ description: 'Needed to invite the staff member to the panel' })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiProperty({ enum: HAIR_STAFF_ROLES })
  @IsIn(HAIR_STAFF_ROLES)
  role!: HairStaffRole;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  branchIds!: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  specialties?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Services this person can do; empty = all' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  serviceIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  photoUrl?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultCommissionPercent?: number;

  @ApiPropertyOptional({ type: [WorkScheduleEntryDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(21)
  @ValidateNested({ each: true })
  @Type(() => WorkScheduleEntryDto)
  workSchedule?: WorkScheduleEntryDto[];

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @Matches(DATE_ID)
  hireDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Shown on the public booking page' })
  @IsOptional()
  @IsBoolean()
  onlineBookable?: boolean;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string;
}

export class UpdateHairStaffDto extends PartialType(CreateHairStaffDto) {}

export class InviteHairStaffDto {
  @ApiPropertyOptional({ description: "Defaults to the staff card's e-mail" })
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;
}

export class StaffScheduleQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD, default: this week Monday' })
  @IsOptional()
  @Matches(DATE_ID)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD inclusive, default: from + 6 days' })
  @IsOptional()
  @Matches(DATE_ID)
  to?: string;
}

export class CreateHairShiftDto {
  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty({ example: '2026-10-08' })
  @Matches(DATE_ID)
  date!: string;

  @ApiProperty({ example: '09:00' })
  @Matches(CLOCK)
  startTime!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(CLOCK)
  endTime!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateHairShiftDto extends PartialType(CreateHairShiftDto) {}

export const TIME_OFF_TYPES = ['annual', 'sick', 'unpaid', 'other'] as const;
export const TIME_OFF_STATUSES = ['pending', 'approved', 'rejected'] as const;

export class CreateHairTimeOffDto {
  @ApiPropertyOptional({ description: 'Defaults to the caller' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiProperty()
  @Matches(DATE_ID)
  startDate!: string;

  @ApiProperty({ description: 'Inclusive' })
  @Matches(DATE_ID)
  endDate!: string;

  @ApiProperty({ enum: TIME_OFF_TYPES })
  @IsIn(TIME_OFF_TYPES)
  type!: (typeof TIME_OFF_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional({ enum: TIME_OFF_STATUSES, description: 'Only admins/managers may set it' })
  @IsOptional()
  @IsIn(TIME_OFF_STATUSES)
  status?: (typeof TIME_OFF_STATUSES)[number];
}

export class UpdateHairTimeOffDto {
  @ApiPropertyOptional({ enum: TIME_OFF_STATUSES })
  @IsOptional()
  @IsIn(TIME_OFF_STATUSES)
  status?: (typeof TIME_OFF_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ID)
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ID)
  endDate?: string;

  @ApiPropertyOptional({ enum: TIME_OFF_TYPES })
  @IsOptional()
  @IsIn(TIME_OFF_TYPES)
  type?: (typeof TIME_OFF_TYPES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  decisionNote?: string;
}

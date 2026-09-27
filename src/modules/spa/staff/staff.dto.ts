import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
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
import { SPA_STAFF_ROLES, SpaStaffRole } from '../shared/spa-roles';

const CLOCK = /^[0-2][0-9]:[0-5][0-9]$/;

export class DayWorkingHoursDto {
  @ApiProperty({ example: '09:00' })
  @Matches(CLOCK)
  start!: string;

  @ApiProperty({ example: '18:00' })
  @Matches(CLOCK)
  end!: string;

  @ApiProperty()
  @IsBoolean()
  off!: boolean;
}

export class WeeklyWorkingHoursDto {
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) pazartesi?: DayWorkingHoursDto;
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) sali?: DayWorkingHoursDto;
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) carsamba?: DayWorkingHoursDto;
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) persembe?: DayWorkingHoursDto;
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) cuma?: DayWorkingHoursDto;
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) cumartesi?: DayWorkingHoursDto;
  @IsOptional() @ValidateNested() @Type(() => DayWorkingHoursDto) pazar?: DayWorkingHoursDto;
}

/** Profile fields only — role, active and email change through the dedicated endpoints. */
export class UpdateSpaStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  ad?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  uzmanliklar?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  primOraniVarsayilan?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  telefon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  iseGirisTarihi?: string;

  @ApiPropertyOptional({ example: '#6366f1' })
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  renk?: string;

  @ApiPropertyOptional({ type: WeeklyWorkingHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => WeeklyWorkingHoursDto)
  calismaSaatleri?: WeeklyWorkingHoursDto;
}

export class InviteSpaStaffDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ad!: string;

  @ApiProperty({ enum: SPA_STAFF_ROLES })
  @IsIn(SPA_STAFF_ROLES)
  role!: SpaStaffRole;
}

export class SetSpaStaffRoleDto {
  @ApiProperty({ enum: SPA_STAFF_ROLES })
  @IsIn(SPA_STAFF_ROLES)
  role!: SpaStaffRole;
}

export const LEAVE_TYPES = ['yillik', 'rapor', 'ucretsiz', 'diger'] as const;
export const LEAVE_STATUSES = ['beklemede', 'onaylandi', 'reddedildi'] as const;

export class CreateSpaLeaveDto {
  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty({ enum: LEAVE_TYPES })
  @IsIn(LEAVE_TYPES)
  type!: (typeof LEAVE_TYPES)[number];

  @ApiPropertyOptional({ enum: LEAVE_STATUSES })
  @IsOptional()
  @IsIn(LEAVE_STATUSES)
  status?: (typeof LEAVE_STATUSES)[number];

  @ApiProperty({ description: 'ISO date (inclusive)' })
  @IsISO8601()
  startDate!: string;

  @ApiProperty({ description: 'ISO date (inclusive)' })
  @IsISO8601()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class UpdateSpaLeaveDto extends PartialType(CreateSpaLeaveDto) {}

export const TASK_STATUSES = ['acik', 'devam', 'tamamlandi'] as const;
export const TASK_PRIORITIES = ['dusuk', 'normal', 'yuksek'] as const;

export class CreateSpaTaskDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  baslik!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  aciklama?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @ApiPropertyOptional({ enum: TASK_PRIORITIES })
  @IsOptional()
  @IsIn(TASK_PRIORITIES)
  priority?: (typeof TASK_PRIORITIES)[number];
}

export class UpdateSpaTaskDto extends PartialType(CreateSpaTaskDto) {}

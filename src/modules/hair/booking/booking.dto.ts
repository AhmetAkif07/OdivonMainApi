import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { CLOCK, DATE_ID } from '../shared/hair-dto';

/** `?serviceIds=a,b` (or repeated `?serviceIds=a&serviceIds=b`) → `['a', 'b']`. */
const toIdList = ({ value }: { value: unknown }) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((id) => String(id).trim())
    .filter(Boolean);

export class PublicStaffQueryDto {
  @ApiPropertyOptional({ description: 'Comma separated service ids the staff member must be able to do' })
  @IsOptional()
  @Transform(toIdList)
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  serviceIds?: string[];
}

export class PublicSlotsQueryDto {
  @ApiProperty({ example: '2026-10-08' })
  @Matches(DATE_ID)
  date!: string;

  @ApiProperty({ description: 'Comma separated service ids, performed in this order' })
  @Transform(toIdList)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;
}

export class PublicTokenQueryDto {
  @ApiProperty({ description: 'Access token returned when the appointment was booked' })
  @IsString()
  @Length(16, 200)
  token!: string;
}

export class PublicBookAppointmentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  serviceIds!: string[];

  @ApiPropertyOptional({ description: 'Omitted = first available staff member' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiProperty({ example: '2026-10-08' })
  @Matches(DATE_ID)
  date!: string;

  @ApiProperty({ example: '14:00' })
  @Matches(CLOCK)
  startTime!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ example: '05321234567' })
  @IsString()
  @Length(7, 32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token (verified when the server has TURNSTILE_SECRET)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  captchaToken?: string;

  @ApiPropertyOptional({ description: 'SMS code from POST …/otp; required when info.requireBookingOtp is true' })
  @IsOptional()
  @Matches(/^\d{6}$/)
  otpCode?: string;
}

export class PublicOtpRequestDto {
  @ApiProperty({ example: '05321234567' })
  @IsString()
  @Length(7, 32)
  phone!: string;

  @ApiPropertyOptional({ description: 'Cloudflare Turnstile token (verified when the server has TURNSTILE_SECRET)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  captchaToken?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const CLOCK = /^[0-2][0-9]:[0-5][0-9]$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Checkout discount ceilings (%) per role; admins are always allowed 100. */
export class MaxDiscountPercentDto {
  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  manager?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  receptionist?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  cashier?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  stylist?: number;
}

export class SmsTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Placeholders: {customerName} {salonName} {branchName} {date} {time} {staffName} {services}',
  })
  @IsOptional()
  @IsString()
  @Length(1, 480)
  text?: string;
}

export class SmsTemplatesDto {
  @ApiPropertyOptional({ type: SmsTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmsTemplateDto)
  confirmation?: SmsTemplateDto;

  @ApiPropertyOptional({ type: SmsTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmsTemplateDto)
  reminder?: SmsTemplateDto;

  @ApiPropertyOptional({ type: SmsTemplateDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmsTemplateDto)
  cancellation?: SmsTemplateDto;
}

const trimList = ({ value }: { value: unknown }) =>
  Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : item)) : value;

/** Each list sent replaces the stored one; lists left out stay as they are. */
export class HairDefinitionsDto {
  @ApiPropertyOptional({ type: [String], example: ['Kira', 'Elektrik'] })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  expenseCategories?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Şampuan', 'Boya'] })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  productCategories?: string[];

  @ApiPropertyOptional({ type: [String], example: ['adet', 'ml'] })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(80, { each: true })
  productUnits?: string[];

  @ApiPropertyOptional({ type: [String], example: ['Müşteri memnuniyetsizliği'] })
  @IsOptional()
  @Transform(trimList)
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(120, { each: true })
  refundReasons?: string[];
}

export class UpdateHairSettingsDto {
  @ApiPropertyOptional({ type: HairDefinitionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HairDefinitionsDto)
  definitions?: HairDefinitionsDto;

  @ApiPropertyOptional({ type: SmsTemplatesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SmsTemplatesDto)
  smsTemplates?: SmsTemplatesDto;

  @ApiPropertyOptional({ type: MaxDiscountPercentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MaxDiscountPercentDto)
  maxDiscountPercent?: MaxDiscountPercentDto;

  @ApiPropertyOptional({ description: 'Online booking asks for an SMS code (needs a configured SMS provider)' })
  @IsOptional()
  @IsBoolean()
  requireBookingOtp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'Europe/Istanbul' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'TRY' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(CLOCK)
  workDayStart?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(CLOCK)
  workDayEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onlineBookingEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoConfirmOnlineBooking?: boolean;

  @ApiPropertyOptional({ example: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168)
  reminderHoursBefore?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(168)
  cancellationHoursBefore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  noShowPolicy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  whatsappEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  birthdayMessageEnabled?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  reengagementDays?: number;
}

export class SaveHairBranchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ description: 'Public booking URL part; generated from the name when omitted' })
  @IsOptional()
  @IsString()
  @Length(3, 80)
  @Matches(SLUG)
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(CLOCK)
  workDayStart?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(CLOCK)
  workDayEnd?: string;

  @ApiPropertyOptional({ example: [1, 2, 3, 4, 5, 6], description: '0 = Sunday' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  workDays?: number[];

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(120)
  slotDurationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

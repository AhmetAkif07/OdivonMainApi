import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BILLING_CYCLES, FARM_PLAN_IDS, PAYMENT_METHODS } from '../shared/farm-plans';

export const FARM_LANGUAGES = ['tr', 'en', 'de', 'nl', 'ru'] as const;

export class FarmOnboardingDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  farmName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  displayName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ enum: FARM_LANGUAGES })
  @IsOptional()
  @IsIn(FARM_LANGUAGES)
  language?: (typeof FARM_LANGUAGES)[number];
}

export class UpdateFarmSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10)
  countryCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  country?: string;

  @ApiPropertyOptional({ enum: FARM_LANGUAGES })
  @IsOptional()
  @IsIn(FARM_LANGUAGES)
  language?: (typeof FARM_LANGUAGES)[number];
}

export class ChangeFarmPlanDto {
  @ApiProperty({ enum: FARM_PLAN_IDS })
  @IsIn(FARM_PLAN_IDS)
  planId!: (typeof FARM_PLAN_IDS)[number];

  @ApiPropertyOptional({ enum: BILLING_CYCLES })
  @IsOptional()
  @IsIn(BILLING_CYCLES)
  billingCycle?: (typeof BILLING_CYCLES)[number];

  @ApiPropertyOptional({ enum: PAYMENT_METHODS })
  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: (typeof PAYMENT_METHODS)[number];
}

export class RecordFarmLoginDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  browser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  os?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  device?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;
}

export class FarmLoginLogsQueryDto {
  @ApiPropertyOptional({ default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class QueueFarmMailDto {
  @ApiProperty({ type: [String] })
  @IsEmail({}, { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(1)
  to!: string[];

  @ApiProperty()
  @IsString()
  @Length(1, 300)
  subject!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(20_000)
  text!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80_000)
  html!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}

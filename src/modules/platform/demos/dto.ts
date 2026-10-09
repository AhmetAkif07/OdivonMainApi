import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max } from 'class-validator';
import { ProductModule, PRODUCT_MODULES } from '../../../shared/authorization/constants';

export class CreateDemoTenantDto {
  @IsEnum(PRODUCT_MODULES)
  module!: ProductModule;

  @IsString()
  @IsNotEmpty()
  tenantName!: string;

  @IsEmail()
  ownerEmail!: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(365)
  days?: number;

  @IsOptional()
  @IsBoolean()
  seed?: boolean;
}

export class ResetDemoDto {
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(365)
  days?: number;

  @IsOptional()
  @IsBoolean()
  reseed?: boolean;
}

export class ConvertDemoDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsEnum(['monthly', 'yearly'])
  billingCycle!: 'monthly' | 'yearly';

  @IsOptional()
  @IsBoolean()
  recordPayment?: boolean;

  @IsOptional()
  @IsNumber()
  amountTRY?: number;
}

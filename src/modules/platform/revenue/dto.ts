import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class RevenueQueryDto {
  @IsOptional()
  from?: string;

  @IsOptional()
  to?: string;

  @IsOptional()
  module?: string;

  @IsOptional()
  mode?: string; // 'live,manual' by default, or 'sandbox', 'all'

  @IsOptional()
  page?: string;

  @IsOptional()
  pageSize?: string;
}

export class RecordManualPaymentDto {
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @IsEnum(['monthly', 'yearly'])
  billingCycle!: 'monthly' | 'yearly';

  @IsNumber()
  @IsPositive()
  amountTRY!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

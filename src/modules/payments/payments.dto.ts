import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { PaymentSource } from './payment-provider';

export class SelectProviderDto {
  @ApiProperty({ enum: ['iyzico', 'none'] })
  @IsIn(['iyzico', 'none'])
  provider!: 'iyzico' | 'none';
}

export class CheckoutBuyerDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) surname!: string;
  @ApiProperty() @Matches(/^\d{11}$/) identityNumber!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @IsNotEmpty() gsmNumber!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) address!: string;
  @ApiProperty() @IsString() @IsNotEmpty() city!: string;
  @ApiPropertyOptional({ default: 'Turkey' }) @IsString() @IsNotEmpty() country = 'Turkey';
}

export class CreateCheckoutDto extends CheckoutBuyerDto {
  @ApiProperty({ enum: ['vet_sale', 'gym_receivable', 'saas_subscription'] })
  @IsIn(['vet_sale', 'gym_receivable', 'saas_subscription']) source!: PaymentSource;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,128}$/) sourceId!: string;
}

export class CreateSaasOrderDto {
  @ApiProperty({ enum: ['starter', 'pro', 'enterprise'] })
  @IsIn(['starter', 'pro', 'enterprise']) planId!: 'starter' | 'pro' | 'enterprise';
  @ApiProperty({ enum: ['monthly', 'yearly'] })
  @IsIn(['monthly', 'yearly']) billingCycle!: 'monthly' | 'yearly';
}

/** Member card payment: package purchase, wallet top-up or the member's own debt plan. */
export class MemberCheckoutDto {
  @ApiProperty({ enum: ['package', 'wallet_topup', 'receivable'] })
  @IsIn(['package', 'wallet_topup', 'receivable'])
  purpose!: 'package' | 'wallet_topup' | 'receivable';

  @ApiPropertyOptional()
  @ValidateIf((dto: MemberCheckoutDto) => dto.purpose === 'package')
  @Matches(/^[A-Za-z0-9_-]{1,128}$/)
  packageId?: string;

  @ApiPropertyOptional({ description: 'TL, only for wallet_topup (50–20000)' })
  @ValidateIf((dto: MemberCheckoutDto) => dto.purpose === 'wallet_topup')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(50)
  @Max(20000)
  amount?: number;

  @ApiPropertyOptional()
  @ValidateIf((dto: MemberCheckoutDto) => dto.purpose === 'receivable')
  @Matches(/^[A-Za-z0-9_-]{1,128}$/)
  receivableId?: string;

  @ApiPropertyOptional({ description: 'Fatura için T.C. kimlik no (yoksa üye kaydındaki)' })
  @IsOptional() @Matches(/^\d{11}$/) identityNumber?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) gsmNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) city?: string;
}

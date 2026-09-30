import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
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

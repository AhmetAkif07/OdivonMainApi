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
  @ApiProperty({ enum: ['vet_sale', 'gym_receivable'] })
  @IsIn(['vet_sale', 'gym_receivable']) source!: PaymentSource;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,128}$/) sourceId!: string;
}

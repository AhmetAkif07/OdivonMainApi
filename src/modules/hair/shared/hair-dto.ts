import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from './hair-money';

export const CLOCK = /^([01][0-9]|2[0-4]):[0-5][0-9]$/;
export const DATE_ID = /^\d{4}-\d{2}-\d{2}$/;
/** KDV rates used in Türkiye (%). */
export const VAT_RATES = [0, 1, 10, 20];

export class PaymentLineDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional({ description: 'Card last 4 digits, receipt no, ...' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  reference?: string;
}

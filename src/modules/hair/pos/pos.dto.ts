import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { IdempotentDto, PaymentLineDto } from '../shared/hair-dto';
import { MAX_LINE_QTY } from '../shared/hair-money';

/** Firestore allows 500 writes per transaction; each line can cause a few (plan §11.4 note). */
export const MAX_CHECKOUT_ITEMS = 40;

export class CheckoutItemDto {
  @ApiProperty({ enum: ['service', 'product', 'package'], description: 'package = sell a package plan' })
  @IsIn(['service', 'product', 'package'])
  type!: 'service' | 'product' | 'package';

  @ApiProperty({ description: 'serviceId / productId / packageId' })
  @IsString()
  refId!: string;

  @ApiPropertyOptional({ description: 'Display only — the server uses the catalog name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QTY)
  quantity!: number;

  @ApiPropertyOptional({ description: 'Display only — the server uses the catalog price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Performing staff of a service line (commission)' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({ description: 'Redeem one session of this customer package (service lines)' })
  @IsOptional()
  @IsString()
  customerPackageId?: string;
}

export class CheckoutDto {
  @ApiProperty({ description: 'Client-generated UUID; a retry with the same key returns the same session' })
  @IsString()
  @Length(8, 100)
  idempotencyKey!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty({ description: 'Session staff (default performer of service lines)' })
  @IsString()
  staffId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHECKOUT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  globalDiscount?: number;

  @ApiProperty({ type: [PaymentLineDto], description: 'Split payments allowed (P-002); empty when nothing is charged' })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments!: PaymentLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class RefundSessionDto extends IdempotentDto {
  @ApiProperty()
  @IsString()
  @Length(1, 500)
  reason!: string;

  @ApiPropertyOptional({ description: 'Partial refund amount; omitted = full refund of what is left' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @ApiPropertyOptional({
    type: [PaymentLineDto],
    description:
      'How the money goes back (method + amount); each method at most what was paid with it minus earlier ' +
      'refunds. Default: the original payment methods, largest first',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  lines?: PaymentLineDto[];

  @ApiPropertyOptional({ type: [PaymentLineDto], description: 'Deprecated alias of `lines`' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments?: PaymentLineDto[];

  @ApiPropertyOptional({ description: 'Full refund only: put sold products back in stock (default true)' })
  @IsOptional()
  @IsBoolean()
  restock?: boolean;
}

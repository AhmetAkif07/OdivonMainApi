import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_LINE_QTY } from '../shared/spa-money';
import { PaymentLineDto } from '../packages/package.dto';

export class CheckoutItemDto {
  @ApiProperty({ enum: ['service', 'product'] })
  @IsIn(['service', 'product'])
  kind!: 'service' | 'product';

  @ApiProperty()
  @IsString()
  refId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(MAX_LINE_QTY)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ description: 'Redeem this service line from a customer package' })
  @IsOptional()
  @IsString()
  customerPackageId?: string;
}

export class CheckoutSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty({ type: [CheckoutItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];

  @ApiProperty({ type: [PaymentLineDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments!: PaymentLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountAmount?: number;
}

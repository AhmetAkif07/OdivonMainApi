import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '../shared/spa-money';

export class PaymentLineDto {
  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  amount!: number;
}

export class CreateSpaPackagePlanDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ad!: string;

  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(500)
  seansAdedi!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fiyat!: number;

  @ApiProperty({ description: 'Days valid after purchase' })
  @IsInt()
  @Min(1)
  @Max(3650)
  gecerlilikGunu!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSpaPackagePlanDto extends PartialType(CreateSpaPackagePlanDto) {}

export const CUSTOMER_PACKAGE_STATUSES = ['active', 'expired', 'tamamlandi'] as const;

export class UpdateSpaCustomerPackageDto {
  @ApiPropertyOptional({ enum: CUSTOMER_PACKAGE_STATUSES })
  @IsOptional()
  @IsIn(CUSTOMER_PACKAGE_STATUSES)
  status?: (typeof CUSTOMER_PACKAGE_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  kalanSeans?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  bitisTarihi?: string;
}

export class SellSpaPackageDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  packagePlanId!: string;

  @ApiProperty({ type: [PaymentLineDto] })
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments!: PaymentLineDto[];
}

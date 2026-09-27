import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PAYMENT_METHODS, PaymentMethod } from '../shared/spa-money';

export class CreateSpaPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  method!: PaymentMethod;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RefundSpaPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export const EXPENSE_CATEGORIES = ['maas', 'prim', 'avans', 'genel'] as const;

export class CreateSpaExpenseDto {
  @ApiProperty({ enum: EXPENSE_CATEGORIES })
  @IsIn(EXPENSE_CATEGORIES)
  kategori!: (typeof EXPENSE_CATEGORIES)[number];

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiProperty({ description: 'ISO instant' })
  @IsISO8601()
  date!: string;
}

export class UpdateSpaExpenseDto extends PartialType(CreateSpaExpenseDto) {}

export class ReopenCashRegisterDayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export const COMMISSION_SCOPES = ['staff', 'serviceType', 'service'] as const;
export const COMMISSION_TYPES = ['percent', 'fixed'] as const;

export class CreateSpaCommissionRuleDto {
  @ApiProperty({ enum: COMMISSION_SCOPES })
  @IsIn(COMMISSION_SCOPES)
  scope!: (typeof COMMISSION_SCOPES)[number];

  @ApiProperty({ description: 'staffId, serviceType tag or serviceId depending on scope' })
  @IsString()
  refId!: string;

  @ApiProperty({ enum: COMMISSION_TYPES })
  @IsIn(COMMISSION_TYPES)
  type!: (typeof COMMISSION_TYPES)[number];

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(1000)
  priority!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSpaCommissionRuleDto extends PartialType(CreateSpaCommissionRuleDto) {}

export class PayoutCommissionsDto {
  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(400)
  @IsString({ each: true })
  accrualIds!: string[];
}

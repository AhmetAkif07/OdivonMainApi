import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DATE_ID, IdempotentDto, PaymentLineDto } from '../shared/hair-dto';
import { PAYMENT_METHODS, PaymentMethod } from '../shared/hair-money';

export class CreateHairPaymentDto extends IdempotentDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiProperty({ type: [PaymentLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  lines!: PaymentLineDto[];

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, default today' })
  @IsOptional()
  @Matches(DATE_ID)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateHairExpenseDto extends IdempotentDto {
  @ApiProperty({ example: 'Kira' })
  @IsString()
  @Length(1, 80)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: PAYMENT_METHODS })
  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, default today' })
  @IsOptional()
  @Matches(DATE_ID)
  date?: string;

  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  receiptUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;
}

export class UpdateHairExpenseDto extends PartialType(OmitType(CreateHairExpenseDto, ['idempotencyKey'] as const)) {}

export class CashRegisterQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, default today' })
  @IsOptional()
  @Matches(DATE_ID)
  date?: string;
}

export class OpenCashRegisterDto extends IdempotentDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingBalance!: number;
}

export class CloseCashRegisterDto extends IdempotentDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiPropertyOptional({ description: 'Physical count at closing (K-004)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedBalance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CountCashRegisterDto {
  @ApiProperty()
  @IsString()
  branchId!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedBalance!: number;
}

export class CreateHairCommissionRuleDto {
  @ApiProperty({ enum: ['staff', 'serviceCategory', 'service'] })
  @IsIn(['staff', 'serviceCategory', 'service'])
  scope!: 'staff' | 'serviceCategory' | 'service';

  @ApiProperty({ description: 'staffId, categoryId or serviceId' })
  @IsString()
  refId!: string;

  @ApiProperty({ enum: ['percent', 'fixed'] })
  @IsIn(['percent', 'fixed'])
  type!: 'percent' | 'fixed';

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  value!: number;

  @ApiPropertyOptional({ description: 'Lower wins within the same scope', default: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  priority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHairCommissionRuleDto extends PartialType(CreateHairCommissionRuleDto) {}

export class PayoutCommissionsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(400)
  @IsString({ each: true })
  commissionIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';

export const RECEIVABLE_PAYMENT_METHODS = ['cash', 'card', 'transfer', 'wallet'] as const;
export type ReceivablePaymentMethod = (typeof RECEIVABLE_PAYMENT_METHODS)[number];

export const RECEIVABLE_STATUSES = ['open', 'paid', 'cancelled'] as const;
export type ReceivableStatus = (typeof RECEIVABLE_STATUSES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreateInstallmentSaleDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty()
  @IsString()
  packageId!: string;

  @ApiProperty({ description: 'Satış anında alınan peşinat (TL), 0 olabilir' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  downPayment!: number;

  @ApiProperty({ minimum: 1, maximum: 36 })
  @IsInt()
  @Min(1)
  @Max(36)
  installmentCount!: number;

  @ApiPropertyOptional({ description: 'İlk taksit vadesi (YYYY-MM-DD); varsayılan satıştan bir ay sonra' })
  @IsOptional()
  @Matches(ISO_DATE)
  firstDueDate?: string;

  @ApiPropertyOptional({ description: 'Paket fiyatından düşülecek indirim (TL)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount?: number;

  @ApiPropertyOptional({ enum: RECEIVABLE_PAYMENT_METHODS, description: 'Peşinatın ödeme yöntemi' })
  @IsOptional()
  @IsIn(RECEIVABLE_PAYMENT_METHODS)
  paymentMethod?: ReceivablePaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReceivablePaymentDto {
  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ enum: RECEIVABLE_PAYMENT_METHODS })
  @IsIn(RECEIVABLE_PAYMENT_METHODS)
  paymentMethod!: ReceivablePaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CancelReceivableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListReceivablesQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ enum: RECEIVABLE_STATUSES })
  @IsOptional()
  @IsIn(RECEIVABLE_STATUSES)
  status?: ReceivableStatus;
}

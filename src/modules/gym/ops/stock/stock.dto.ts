import { ApiPropertyOptional } from '@nestjs/swagger';
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
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const PURCHASE_ORDER_STATUSES = ['draft', 'ordered', 'received', 'cancelled'] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];

export class LowStockQueryDto {
  @ApiPropertyOptional({ description: 'Yalnız bu tedarikçiye bağlı ürünler' })
  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class StockMovementQueryDto {
  @IsOptional()
  @IsString()
  productId?: string;
}

export class CreateStockCountDto {
  @ApiPropertyOptional({ description: 'Sayılacak ürünler; boşsa tüm aktif ürünler' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class StockCountEntryDto {
  @IsString()
  productId!: string;

  /** Counted quantity; null clears the entry. */
  @IsOptional()
  @IsInt()
  @Min(0)
  counted!: number | null;
}

export class UpdateStockCountDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => StockCountEntryDto)
  entries?: StockCountEntryDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PurchaseOrderLineDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];

  @ApiPropertyOptional({ description: 'YYYY-MM-DD' })
  @IsOptional()
  @Matches(DAY)
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines?: PurchaseOrderLineDto[];

  @IsOptional()
  @Matches(DAY)
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ReceivedLineDto {
  @IsString()
  productId!: string;

  @IsInt()
  @Min(0)
  receivedQuantity!: number;
}

export class ReceivePurchaseOrderDto {
  @ApiPropertyOptional({ description: 'Gelen miktarlar; verilmezse siparişteki miktarların tamamı' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReceivedLineDto)
  lines?: ReceivedLineDto[];
}

export class PurchaseOrderQueryDto {
  @IsOptional()
  @IsIn(PURCHASE_ORDER_STATUSES)
  status?: PurchaseOrderStatus;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

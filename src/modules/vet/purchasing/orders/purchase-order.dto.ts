import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PO_STATUSES, PurchaseOrderStatus } from './purchase-order.entity';

export class PurchaseOrderLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @ApiProperty({ example: 50 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  orderedQuantity!: number;

  @ApiProperty({ example: 380 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  discountPercent?: number = 0;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  taxRatio?: number = 20;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ example: 'SIP-2026-0089' })
  @IsString()
  @IsNotEmpty()
  orderNo!: string;

  @ApiProperty({ example: 'sup-101' })
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiProperty({ example: 'Hedef Ecza Deposu' })
  @IsString()
  @IsNotEmpty()
  supplierName!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  rfqId?: string | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  demandId?: string | null;

  @ApiProperty({ example: '2026-10-11' })
  @IsString()
  @IsNotEmpty()
  orderDate!: string;

  @ApiProperty({ example: '2026-10-14' })
  @IsString()
  @IsNotEmpty()
  expectedDeliveryDate!: string;

  @ApiPropertyOptional({ example: '60 Gün Vade' })
  @IsOptional()
  @IsString()
  paymentTerm?: string | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  paymentMethodId?: string | null;

  @ApiPropertyOptional({ enum: PO_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn(PO_STATUSES)
  status?: PurchaseOrderStatus = 'draft';

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdatePurchaseOrderDto extends PartialType(CreatePurchaseOrderDto) {}

export class ReceivedLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 25 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @ApiPropertyOptional({ example: 'LT-2026-894' })
  @IsOptional()
  @IsString()
  batchNo?: string | null;

  @ApiPropertyOptional({ example: '2027-11-30' })
  @IsOptional()
  @IsString()
  expirationDate?: string | null;
}

export class ReceiveGoodsDto {
  @ApiProperty({ example: '2026-10-13' })
  @IsString()
  @IsNotEmpty()
  receiptDate!: string;

  @ApiPropertyOptional({ example: 'GIB-2026-00049182' })
  @IsOptional()
  @IsString()
  invoiceNo?: string | null;

  @ApiProperty({ example: 'store-1' })
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @ApiPropertyOptional({ example: 'Ana İlaç Deposu' })
  @IsOptional()
  @IsString()
  storeName?: string | null;

  @ApiProperty({ type: [ReceivedLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivedLineDto)
  receivedLines!: ReceivedLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

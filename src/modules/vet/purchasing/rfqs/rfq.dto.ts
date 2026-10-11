import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { RFQ_STATUSES, RfqStatus } from './rfq.entity';

export class RfqItemDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productCode?: string | null;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  requestedQuantity!: number;

  @ApiProperty({ example: 'Kutu' })
  @IsString()
  @IsNotEmpty()
  unit!: string;

  @ApiPropertyOptional({ example: 450 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  targetUnitPrice?: number | null;
}

export class CreateRfqDto {
  @ApiProperty({ example: 'TEK-2026-0042' })
  @IsString()
  @IsNotEmpty()
  rfqNo!: string;

  @ApiProperty({ example: '2026 Q4 Karma Aşı ve Cerrahi Set Teklif Toplama' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  demandId?: string | null;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsString()
  demandDocumentNo?: string | null;

  @ApiProperty({ example: '2026-10-11' })
  @IsString()
  @IsNotEmpty()
  date!: string;

  @ApiProperty({ example: '2026-10-20' })
  @IsString()
  @IsNotEmpty()
  deadlineDate!: string;

  @ApiPropertyOptional({ enum: RFQ_STATUSES, default: 'collecting' })
  @IsOptional()
  @IsIn(RFQ_STATUSES)
  status?: RfqStatus = 'collecting';

  @ApiProperty({ type: [RfqItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RfqItemDto)
  items!: RfqItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  evaluationNotes?: string | null;
}

export class UpdateRfqDto extends PartialType(CreateRfqDto) {}

export class RfqBidLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productName!: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  offeredQuantity!: number;

  @ApiProperty({ example: 420 })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AddSupplierBidDto {
  @ApiProperty({ example: 'sup-101' })
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @ApiProperty({ example: 'Hedef Ecza Deposu' })
  @IsString()
  @IsNotEmpty()
  supplierName!: string;

  @ApiProperty({ example: '2026-10-12' })
  @IsString()
  @IsNotEmpty()
  bidDate!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsNumber()
  deliveryDays!: number;

  @ApiProperty({ example: 60 })
  @Type(() => Number)
  @IsNumber()
  paymentTermDays!: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  validityDays?: number = 30;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  shippingIncluded?: boolean = true;

  @ApiProperty({ type: [RfqBidLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RfqBidLineDto)
  lines!: RfqBidLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class AwardBidDto {
  @ApiProperty({ example: 'bid-1' })
  @IsString()
  @IsNotEmpty()
  bidId!: string;

  @ApiProperty({ example: 'En düşük birim fiyat, 60 gün vade ve ertesi gün teslimat taahhüdü.' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

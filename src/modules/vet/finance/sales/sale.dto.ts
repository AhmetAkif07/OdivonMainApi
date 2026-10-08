import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { SALE_TYPES, SaleType } from './sale.entity';

export class SaleLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  vatIncluded?: boolean;
}

export class CreateSaleDto {
  @ApiProperty({ enum: SALE_TYPES })
  @IsIn(SALE_TYPES)
  type!: SaleType;

  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethodId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashRegisterId?: string | null;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isQuickSale?: boolean;

  @ApiProperty({ type: [SaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines!: SaleLineDto[];
}

export class UpdateSaleDto extends PartialType(CreateSaleDto) {}

export class ListSalesQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: SALE_TYPES })
  @IsOptional()
  @IsIn(SALE_TYPES)
  type?: SaleType;
}

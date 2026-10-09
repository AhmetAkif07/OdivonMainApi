import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { STOCK_DIRECTIONS, STOCK_REASONS, StockDirection, StockReason } from './stock-movement.entity';

export class CreateStockMovementDto {
  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty({ enum: STOCK_DIRECTIONS })
  @IsIn(STOCK_DIRECTIONS)
  direction!: StockDirection;

  @ApiProperty({ enum: STOCK_REASONS })
  @IsIn(STOCK_REASONS)
  reason!: StockReason;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  expirationDate?: string | null;
}

export class UpdateStockMovementDto extends PartialType(CreateStockMovementDto) {}

export class ListStockMovementsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: STOCK_DIRECTIONS })
  @IsOptional()
  @IsIn(STOCK_DIRECTIONS)
  direction?: StockDirection;
}

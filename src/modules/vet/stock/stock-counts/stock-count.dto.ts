import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
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
import { STOCK_COUNT_STATUSES, StockCountStatus } from './stock-count.entity';

export class CreateStockCountDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  storeId!: string;

  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ description: 'Count only these products; default is every stocked product in the store' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class StockCountLineInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Null clears the count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity?: number | null;
}

export class UpdateStockCountDto {
  @ApiPropertyOptional({ type: [StockCountLineInputDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => StockCountLineInputDto)
  lines?: StockCountLineInputDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class StockCountQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  storeId?: string;

  @ApiPropertyOptional({ enum: STOCK_COUNT_STATUSES })
  @IsOptional()
  @IsIn(STOCK_COUNT_STATUSES)
  status?: StockCountStatus;
}

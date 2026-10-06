import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const HAIR_MAX_LIST_LIMIT = 200;
export const HAIR_DEFAULT_LIST_LIMIT = 50;

/** Shared list query: optional window on the collection's date field, equality filters, cursor paging. */
export class HairListQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive lower bound (ISO instant or YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive upper bound (ISO instant or YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ maximum: HAIR_MAX_LIST_LIMIT, default: HAIR_DEFAULT_LIST_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(HAIR_MAX_LIST_LIMIT)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque cursor from the previous page (`nextCursor`)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Free-text search (name / phone) where supported' })
  @IsOptional()
  @IsString()
  q?: string;
}

export interface HairPage<T> {
  items: T[];
  nextCursor: string | null;
}

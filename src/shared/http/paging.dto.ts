import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';
import { ColumnFilters, parseColumnFilters } from './column-filters';

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

export class PagingQueryDto {
  @ApiPropertyOptional({ default: DEFAULT_PAGE_LIMIT, maximum: MAX_PAGE_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_LIMIT)
  limit?: number = DEFAULT_PAGE_LIMIT;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'JSON object of column contains filters, e.g. {"firstName":"ahmet"}',
    type: 'string',
  })
  @IsOptional()
  @Transform(({ value }) => parseColumnFilters(value))
  @IsObject()
  filters?: ColumnFilters;
}

export interface CursorPayload {
  createdAt: string;
  id: string;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
  if (!parsed?.createdAt || !parsed?.id) {
    throw new Error('Invalid cursor');
  }
  return parsed;
}

export function resolveLimit(limit?: number): number {
  if (!limit) {
    return DEFAULT_PAGE_LIMIT;
  }
  return Math.min(Math.max(limit, 1), MAX_PAGE_LIMIT);
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';

export class ListCustomersQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ description: 'Search by name, phone or email' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
  })
  q?: string;

  @ApiPropertyOptional({ description: 'When omitted, both archived and active customers are returned (excluding soft-deleted).' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === '') {
      return undefined;
    }
    return value === true || value === 'true';
  })
  @IsBoolean()
  isArchive?: boolean;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';

export class ListCustomersQueryDto extends PagingQueryDto {
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

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';

export class ListHotelDailyLogsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stayId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  date?: string;
}

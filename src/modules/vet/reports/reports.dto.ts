import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class VetReportFilterQueryDto {
  @ApiPropertyOptional({ description: 'today, this_week, this_month, this_year, custom', example: 'this_month' })
  @IsOptional()
  @IsString()
  range?: string;

  @ApiPropertyOptional({ description: 'Start date in ISO or YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date in ISO or YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ description: 'Filter by branch id or "all"' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Filter by staff / doctor id or "all"' })
  @IsOptional()
  @IsString()
  staffId?: string;
}

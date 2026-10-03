import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class HourlyOccupancyQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD; varsayılan bitişten 27 gün önce' })
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD; varsayılan bugün' })
  @IsOptional()
  @Matches(DAY)
  to?: string;
}

export class ChurnQueryDto {
  @ApiPropertyOptional({ default: 6, minimum: 1, maximum: 24 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  months?: number;
}

export class BranchReportQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD; varsayılan ayın ilk günü' })
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD; varsayılan bugün' })
  @IsOptional()
  @Matches(DAY)
  to?: string;
}

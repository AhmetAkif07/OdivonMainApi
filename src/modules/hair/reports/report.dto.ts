import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches } from 'class-validator';
import { DATE_ID } from '../shared/hair-dto';

export class HairReportQueryDto {
  @ApiPropertyOptional({ description: 'Single day (daily report), YYYY-MM-DD; default today' })
  @IsOptional()
  @Matches(DATE_ID)
  date?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD; default 30 days before `to`' })
  @IsOptional()
  @Matches(DATE_ID)
  from?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD inclusive; default today' })
  @IsOptional()
  @Matches(DATE_ID)
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'Staff filter (stylists always see their own)' })
  @IsOptional()
  @IsString()
  staffId?: string;
}

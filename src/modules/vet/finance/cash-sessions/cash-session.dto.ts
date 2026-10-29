import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { CASH_SESSION_STATUSES, CashSessionStatus } from './cash-session.entity';

export class OpenCashSessionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cashRegisterId!: string;

  @ApiProperty({ description: 'Cash in the drawer when the till is opened' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  openingAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class CloseCashSessionDto {
  @ApiProperty({ description: 'Cash counted in the drawer at close' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedAmount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class CashSessionQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashRegisterId?: string;

  @ApiPropertyOptional({ enum: CASH_SESSION_STATUSES })
  @IsOptional()
  @IsIn(CASH_SESSION_STATUSES)
  status?: CashSessionStatus;
}

export class CurrentCashSessionQueryDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cashRegisterId!: string;
}

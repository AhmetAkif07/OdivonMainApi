import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CASH_DIRECTIONS, CashDirection } from './cash-movement.entity';

export class CreateCashMovementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  cashRegisterId!: string;

  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiProperty({ enum: CASH_DIRECTIONS })
  @IsIn(CASH_DIRECTIONS)
  direction!: CashDirection;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class UpdateCashMovementDto extends PartialType(CreateCashMovementDto) {}

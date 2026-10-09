import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { DATE_ID } from '../shared/hair-dto';

export const INVENTORY_TYPES = ['in', 'out', 'adjustment'] as const;
export type InventoryType = (typeof INVENTORY_TYPES)[number];

export class CreateInventoryTransactionDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ enum: INVENTORY_TYPES })
  @IsIn(INVENTORY_TYPES)
  type!: InventoryType;

  @ApiProperty({ description: 'in/out: amount moved; adjustment: the counted stock level (new absolute value)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  quantity!: number;

  @ApiProperty({ description: 'Mandatory (S-006)' })
  @IsString()
  @Length(1, 300)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, default today' })
  @IsOptional()
  @Matches(DATE_ID)
  date?: string;
}

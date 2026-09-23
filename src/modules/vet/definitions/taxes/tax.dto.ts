import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { TAX_TYPES, TaxType } from './tax.entity';

export class CreateTaxDto {
  @ApiProperty({ example: 'KDV %20' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  ratio!: number;

  @ApiPropertyOptional({ enum: TAX_TYPES, default: 'both' })
  @IsOptional()
  @IsIn(TAX_TYPES)
  type?: TaxType;
}

export class UpdateTaxDto extends PartialType(CreateTaxDto) {}

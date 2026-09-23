import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { DEMAND_STATUSES, DemandStatus } from './demand.entity';

export class DemandLineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateDemandDto {
  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  deliveryDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string | null;

  @ApiPropertyOptional({ enum: DEMAND_STATUSES, default: 'draft' })
  @IsOptional()
  @IsIn(DEMAND_STATUSES)
  status?: DemandStatus;

  @ApiProperty({ type: [DemandLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DemandLineDto)
  lines!: DemandLineDto[];
}

export class UpdateDemandDto extends PartialType(CreateDemandDto) {}

export class ListDemandsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: DEMAND_STATUSES })
  @IsOptional()
  @IsIn(DEMAND_STATUSES)
  status?: DemandStatus;
}

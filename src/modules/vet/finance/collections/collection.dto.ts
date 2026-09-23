import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { COLLECTION_KINDS, CollectionKind } from './collection.entity';

export class CreateCollectionDto {
  @ApiProperty({ enum: COLLECTION_KINDS })
  @IsIn(COLLECTION_KINDS)
  kind!: CollectionKind;

  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethodId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashRegisterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  saleId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class UpdateCollectionDto extends PartialType(CreateCollectionDto) {}

export class ListCollectionsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: COLLECTION_KINDS })
  @IsOptional()
  @IsIn(COLLECTION_KINDS)
  kind?: CollectionKind;
}

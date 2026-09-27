import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSpaRoomDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ad!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(100)
  kapasite!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSpaRoomDto extends PartialType(CreateSpaRoomDto) {}

export class CreateSpaServiceDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ad!: string;

  @ApiProperty({ description: 'Kategori etiketi: masaj, cilt bakımı, ...' })
  @IsString()
  @Length(1, 60)
  tur!: string;

  @ApiProperty()
  @IsInt()
  @Min(5)
  @Max(12 * 60)
  sureDk!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fiyat!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  kategori?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  uygunStaffIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSpaServiceDto extends PartialType(CreateSpaServiceDto) {}

export class CreateSpaProductDto {
  @ApiProperty()
  @IsString()
  @Length(1, 60)
  sku!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ad!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fiyat!: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  kritikStokSeviyesi!: number;

  @ApiPropertyOptional({ description: 'Opening stock; later changes go through stock movements' })
  @IsOptional()
  @IsInt()
  @Min(0)
  mevcutStok?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Admins may still correct `mevcutStok` directly; routine changes go through stock movements. */
export class UpdateSpaProductDto extends PartialType(CreateSpaProductDto) {}

export const STOCK_MOVEMENT_TYPES = ['giris', 'fire', 'sayim', 'iade'] as const;

export class CreateStockMovementDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ enum: STOCK_MOVEMENT_TYPES })
  @IsIn(STOCK_MOVEMENT_TYPES)
  type!: (typeof STOCK_MOVEMENT_TYPES)[number];

  @ApiProperty({
    description:
      'Signed delta: giriş/iade positive, fire negative, sayım = delta to the counted value',
  })
  @IsInt()
  @Min(-100000)
  @Max(100000)
  qty!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

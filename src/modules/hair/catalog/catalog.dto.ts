import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDivisibleBy,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { VAT_RATES } from '../shared/hair-dto';

export class CreateHairServiceCategoryDto {
  @ApiProperty({ example: 'Boyama' })
  @IsString()
  @Length(1, 80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHairServiceCategoryDto extends PartialType(CreateHairServiceCategoryDto) {}

export class ProductUsageDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiProperty({ description: 'Amount in the product unit consumed per service' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  @Max(100000)
  quantity!: number;
}

export class CreateHairServiceDto {
  @ApiProperty()
  @IsString()
  categoryId!: string;

  @ApiProperty({ example: 'Erkek Saç Kesimi' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ example: 30, description: 'Multiple of 5, 5–600' })
  @IsInt()
  @IsDivisibleBy(5)
  @Min(5)
  @Max(600)
  durationMinutes!: number;

  @ApiProperty({ example: 350 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ enum: ['male', 'female', 'unisex'] })
  @IsOptional()
  @IsIn(['male', 'female', 'unisex'])
  gender?: 'male' | 'female' | 'unisex';

  @ApiPropertyOptional({ description: 'Colour services: a formula is expected' })
  @IsOptional()
  @IsBoolean()
  requiresFormula?: boolean;

  @ApiPropertyOptional({ description: 'Waiting time inside durationMinutes (R-012)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(600)
  processingMinutes?: number;

  @ApiPropertyOptional({ description: 'Optional online booking deposit (R-016); at most the price' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  depositAmount?: number;

  @ApiPropertyOptional({ example: 20, enum: VAT_RATES })
  @IsOptional()
  @IsIn(VAT_RATES)
  vatRate?: number;

  @ApiPropertyOptional({ type: [ProductUsageDto], description: 'Consumables deducted at checkout (S-002)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductUsageDto)
  productsUsed?: ProductUsageDto[];

  @ApiPropertyOptional({ type: [String], description: 'Empty = every branch' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  branchIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Empty = every staff member' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  staffIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onlineBookable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHairServiceDto extends PartialType(CreateHairServiceDto) {}

export class CreateHairProductDto {
  @ApiProperty({ example: "L'Oreal Majirel 6.0" })
  @IsString()
  @Length(1, 160)
  name!: string;

  @ApiProperty({ example: 'Boya' })
  @IsString()
  @Length(1, 80)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @ApiProperty({ example: 'adet' })
  @IsString()
  @Length(1, 20)
  unit!: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  purchasePrice!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salePrice!: number;

  @ApiPropertyOptional({ description: 'Opening stock; later changes go through inventory transactions' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  currentStock?: number;

  @ApiProperty({ description: 'Low stock threshold (S-005)' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  minStock!: number;

  @ApiPropertyOptional({ description: 'Empty = general store' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional({ example: 20, enum: VAT_RATES })
  @IsOptional()
  @IsIn(VAT_RATES)
  vatRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Stock is not editable here — use inventory transactions (S-004/S-006). */
export class UpdateHairProductDto extends PartialType(OmitType(CreateHairProductDto, ['currentStock'] as const)) {}

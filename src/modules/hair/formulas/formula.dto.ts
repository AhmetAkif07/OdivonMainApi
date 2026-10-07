import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { DATE_ID } from '../shared/hair-dto';

export class FormulaProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  productId?: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  productName!: string;

  @ApiProperty({ example: '50ml' })
  @IsString()
  @Length(1, 40)
  quantity!: string;
}

export class CreateHairFormulaDto {
  @ApiProperty({ example: 'Ombre Formülü — Ekim 2026' })
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiProperty({ example: '6/0 + 7/1 oksidan %20 30dk' })
  @IsString()
  @Length(1, 4000)
  formula!: string;

  @ApiPropertyOptional({ type: [FormulaProductDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => FormulaProductDto)
  products?: FormulaProductDto[];

  @ApiPropertyOptional({ description: 'Defaults to the caller' })
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({ description: 'Defaults to today (YYYY-MM-DD)' })
  @IsOptional()
  @Matches(DATE_ID)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string;
}

export class UpdateHairFormulaDto extends PartialType(CreateHairFormulaDto) {}

export class CreateHairMediaDto {
  @ApiPropertyOptional({ description: 'Download URL (client uploads to Storage first)' })
  @ValidateIf((dto: CreateHairMediaDto) => !dto.storagePath)
  @IsUrl({ require_tld: false })
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({ description: 'Storage object path, alternative to url' })
  @ValidateIf((dto: CreateHairMediaDto) => !dto.url)
  @IsString()
  @Length(1, 500)
  storagePath?: string;

  @ApiPropertyOptional({ enum: ['photo', 'video'], default: 'photo' })
  @IsOptional()
  @IsIn(['photo', 'video'])
  type?: 'photo' | 'video';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  contentType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  appointmentId?: string;
}

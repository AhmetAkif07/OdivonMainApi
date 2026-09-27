import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export const CUSTOMER_GENDERS = ['kadin', 'erkek', 'belirtilmedi'] as const;

export class CreateSpaCustomerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ad!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 32)
  telefon!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ enum: CUSTOMER_GENDERS })
  @IsIn(CUSTOMER_GENDERS)
  cinsiyet!: (typeof CUSTOMER_GENDERS)[number];

  @ApiPropertyOptional({ description: 'ISO date' })
  @IsOptional()
  @IsISO8601()
  dogumTarihi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  kaynak?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  etiketler?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  saglikNotu?: string;

  @ApiProperty()
  @IsBoolean()
  kvkkOnay!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSpaCustomerDto extends PartialType(CreateSpaCustomerDto) {}

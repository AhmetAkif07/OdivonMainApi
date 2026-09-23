import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { VACCINE_RENEWALS, VaccineRenewal } from './vaccine.entity';

export class VaccineMedicineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ default: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  salesAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;
}

export class CreateVaccineDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  animalType?: string | null;

  @ApiProperty({ description: 'İlk dozun yapılacağı gün (doğumdan veya bir önceki dozdan)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  timeDone!: number;

  @ApiProperty({ enum: VACCINE_RENEWALS })
  @IsIn(VACCINE_RENEWALS)
  renewal!: VaccineRenewal;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  totalSaleAmount?: number;

  @ApiProperty({ type: [VaccineMedicineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VaccineMedicineDto)
  medicines!: VaccineMedicineDto[];
}

export class UpdateVaccineDto extends PartialType(CreateVaccineDto) {}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString } from 'class-validator';

export class UpdatePatientDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chipNumber?: string;

  @ApiPropertyOptional({ enum: ['male', 'female', 'unknown'] })
  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  sex?: 'male' | 'female' | 'unknown';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  animalType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  breed?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sterilization?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pedigreeNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  registrationClub?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  titles?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  motherPedigreeNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fatherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fatherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fatherPedigreeNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paternalGrandfatherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paternalGrandmotherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maternalGrandfatherName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maternalGrandmotherName?: string;
}

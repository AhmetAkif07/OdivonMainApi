import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertGymInfoDto {
  @ApiProperty()
  @IsString()
  businessName!: string;

  @ApiPropertyOptional({ enum: ['individual', 'company'] })
  @IsOptional()
  @IsIn(['individual', 'company'])
  businessType?: 'individual' | 'company';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultPackageId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxFreezeDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cancellationPolicy?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  termsAndConditions?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  openTime?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closeTime?: string | null;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  workingDays?: number[];
}

export class PatchGymInfoDto extends PartialType(UpsertGymInfoDto) {}

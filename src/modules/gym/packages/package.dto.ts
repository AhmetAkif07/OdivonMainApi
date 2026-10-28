import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';

export class TrainerPricingDto {
  @ApiProperty()
  @IsString()
  trainerId!: string;

  @ApiProperty()
  @IsString()
  trainerName!: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sessionCount?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  commissionRate?: number | null;
}

export class CreatePackageDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiPropertyOptional({ enum: ['day', 'month', 'year'] })
  @IsOptional()
  @IsIn(['day', 'month', 'year'])
  durationType?: 'day' | 'month' | 'year';

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  durationValue?: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  maxFreeze?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  trialEligible?: boolean;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  allowedDays?: number[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkInStartTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkInEndTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  sessionCount?: number | null;

  @ApiPropertyOptional({ description: 'Grup dersi hakkı (dönem başına); boş = sınırsız', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  classCredits?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isUnlimitedSessions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredDocuments?: string[];

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'archived'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'archived'])
  status?: 'active' | 'inactive' | 'archived';

  @ApiPropertyOptional({ enum: ['gym', 'trainer'], description: 'Paket Kapsamı: gym = Salon Geneli, trainer = Personele Özel' })
  @IsOptional()
  @IsIn(['gym', 'trainer'])
  packageScope?: 'gym' | 'trainer';

  @ApiPropertyOptional({ description: 'Atanmış antrenör / personel ID' })
  @IsOptional()
  @IsString()
  trainerId?: string | null;

  @ApiPropertyOptional({ description: 'Atanmış antrenör / personel adı' })
  @IsOptional()
  @IsString()
  trainerName?: string | null;

  @ApiPropertyOptional({ description: 'Personele ödenecek prim / komisyon yüzdesi (%)' })
  @IsOptional()
  @IsNumber()
  trainerCommissionRate?: number | null;

  @ApiPropertyOptional({ type: [TrainerPricingDto], description: 'Eğitmene göre özel fiyatlandırma listesi' })
  @IsOptional()
  @IsArray()
  trainerPricing?: TrainerPricingDto[];
}

export class UpdatePackageDto extends PartialType(CreatePackageDto) {}

export class ListPackagesQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['active', 'inactive', 'archived'])
  status?: 'active' | 'inactive' | 'archived';

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  activeOnly?: boolean;

  @ApiPropertyOptional({ enum: ['gym', 'trainer'] })
  @IsOptional()
  @IsIn(['gym', 'trainer'])
  packageScope?: 'gym' | 'trainer';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerId?: string;
}

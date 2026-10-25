import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { RELEASE_TYPES, ReleaseType } from './release.types';

const VERSION_PATTERN = /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/;

export class ListReleasesQueryDto {
  @IsOptional()
  @IsString()
  module?: string;
}

export class CreateReleaseDto {
  @ApiProperty({ enum: PRODUCT_MODULES })
  @IsIn(PRODUCT_MODULES as unknown as string[])
  module!: ProductModule;

  @ApiProperty({ example: '1.4.0' })
  @Matches(VERSION_PATTERN, { message: 'version must look like 1.2.3' })
  version!: string;

  @ApiProperty({ example: 'Randevu ekranı yenilendi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ description: 'Sürüm notları (değişiklik listesi)' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @ApiPropertyOptional({ enum: RELEASE_TYPES, default: 'minor' })
  @IsOptional()
  @IsIn(RELEASE_TYPES as unknown as string[])
  type?: ReleaseType;

  @ApiPropertyOptional({ description: 'Yayın tarihi; boşsa şimdi' })
  @IsOptional()
  @IsISO8601()
  releasedAt?: string;
}

export class UpdateReleaseDto {
  @IsOptional()
  @Matches(VERSION_PATTERN, { message: 'version must look like 1.2.3' })
  version?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @IsOptional()
  @IsIn(RELEASE_TYPES as unknown as string[])
  type?: ReleaseType;

  @IsOptional()
  @IsISO8601()
  releasedAt?: string;
}

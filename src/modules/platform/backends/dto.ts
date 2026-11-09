import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { TENANT_SOURCES, TenantSource } from './backend.types';

const HTTPS = { require_protocol: true, protocols: ['https'], require_tld: true };

export class UpsertBackendDto {
  @ApiProperty({ example: 'Odivon ERP' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  products?: string[];

  @ApiPropertyOptional({ example: 'https://apierp.odivon.com' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUrl(HTTPS)
  apiUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://apierp.odivon.com/healthz' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUrl(HTTPS)
  healthUrl?: string | null;

  @ApiPropertyOptional({ example: 'https://erp.odivon.com' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUrl(HTTPS)
  webUrl?: string | null;

  @ApiPropertyOptional({ example: 'odivonerp-38335' })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @Matches(/^[a-z][a-z0-9-]{4,40}$/, { message: 'firebaseProjectId geçersiz' })
  firebaseProjectId?: string | null;

  @ApiPropertyOptional({ enum: TENANT_SOURCES })
  @IsOptional()
  @IsIn(TENANT_SOURCES as unknown as string[])
  tenantSource?: TenantSource;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_o, v) => v !== null && v !== '')
  @IsUrl(HTTPS)
  tenantsUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;
}

export class RemoteTenantStatusDto {
  @ApiProperty({ enum: ['active', 'suspended', 'closed'] })
  @IsIn(['active', 'suspended', 'closed'])
  status!: 'active' | 'suspended' | 'closed';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

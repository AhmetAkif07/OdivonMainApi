import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface GymBank extends BaseDocument {
  tenantId?: string;
  bankName: string;
  branchName?: string;
  accountNumber?: string;
  iban?: string;
  hasPos: boolean;
  posTerminalNo?: string;
  posModel?: string;
  posCommissionRate?: number;
  isDefaultPos?: boolean;
  status: 'active' | 'inactive';
  colorTag?: string;
}

export class CreateGymBankDto {
  @ApiProperty({ example: 'Garanti BBVA', description: 'Banka adı' })
  @IsString()
  bankName!: string;

  @ApiPropertyOptional({ example: 'Kadıköy Şubesi' })
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional({ example: '1234567' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'TR12 0006 2000 0001 2345 6789 01' })
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional({ example: true, description: 'Bu bankaya ait fiziki POS cihazı var mı?' })
  @IsOptional()
  @IsBoolean()
  hasPos?: boolean;

  @ApiPropertyOptional({ example: 'GAR-0091823', description: 'POS Terminal Numarası' })
  @IsOptional()
  @IsString()
  posTerminalNo?: string;

  @ApiPropertyOptional({ example: 'Beko 300TR Android POS' })
  @IsOptional()
  @IsString()
  posModel?: string;

  @ApiPropertyOptional({ example: 1.85, description: 'POS komisyon oranı (%)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  posCommissionRate?: number;

  @ApiPropertyOptional({ example: true, description: 'Varsayılan POS mu?' })
  @IsOptional()
  @IsBoolean()
  isDefaultPos?: boolean;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  status?: 'active' | 'inactive';

  @ApiPropertyOptional({ example: 'emerald' })
  @IsOptional()
  @IsString()
  colorTag?: string;
}

export class UpdateGymBankDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  iban?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasPos?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  posTerminalNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  posModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  posCommissionRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefaultPos?: boolean;

  @ApiPropertyOptional({ enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  status?: 'active' | 'inactive';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  colorTag?: string;
}


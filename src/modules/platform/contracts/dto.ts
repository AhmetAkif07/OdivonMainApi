import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PRODUCT_MODULES } from '../../../shared/authorization/constants';
import {
  CLAUSE_CATEGORIES,
  CONTRACT_KINDS,
  ClauseCategory,
  ContractKind,
  ContractProduct,
} from './contract.types';

export const CONTRACT_PRODUCTS = ['all', ...PRODUCT_MODULES] as const;

export class ContractClauseDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(20000)
  body!: string;

  @IsIn(CLAUSE_CATEGORIES as unknown as string[])
  category!: ClauseCategory;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sampleId?: string | null;
}

export class ListContractsQueryDto {
  @IsOptional()
  @IsString()
  product?: string;

  @IsOptional()
  @IsString()
  kind?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateContractDto {
  @ApiProperty({ example: 'Odivon Spor Salonu – Satış (Abonelik) Sözleşmesi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ enum: CONTRACT_KINDS })
  @IsIn(CONTRACT_KINDS as unknown as string[])
  kind!: ContractKind;

  @ApiProperty({ enum: CONTRACT_PRODUCTS })
  @IsIn(CONTRACT_PRODUCTS as unknown as string[])
  product!: ContractProduct;

  @ApiPropertyOptional({ example: '1.0' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @ApiPropertyOptional({ type: [ContractClauseDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ContractClauseDto)
  clauses?: ContractClauseDto[];

  @IsOptional()
  @IsBoolean()
  requiresAcceptance?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string | null;
}

export class UpdateContractDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(CONTRACT_KINDS as unknown as string[])
  kind?: ContractKind;

  @IsOptional()
  @IsIn(CONTRACT_PRODUCTS as unknown as string[])
  product?: ContractProduct;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ContractClauseDto)
  clauses?: ContractClauseDto[];

  @IsOptional()
  @IsBoolean()
  requiresAcceptance?: boolean;

  @IsOptional()
  @IsBoolean()
  legalReviewed?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string | null;
}

export class CreateFromSampleDto {
  @ApiProperty({ enum: CONTRACT_KINDS })
  @IsIn(CONTRACT_KINDS as unknown as string[])
  kind!: ContractKind;

  @ApiProperty({ enum: CONTRACT_PRODUCTS })
  @IsIn(CONTRACT_PRODUCTS as unknown as string[])
  product!: ContractProduct;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class PreviewContractDto {
  @ApiPropertyOptional({ description: 'Alıcı bilgilerini bu işletmeden doldur' })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  tenantId?: string;
}

export class UpdateContractPartyDto {
  @IsOptional() @IsString() @MaxLength(300) companyName?: string;
  @IsOptional() @IsString() @MaxLength(100) shortName?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(100) taxOffice?: string;
  @IsOptional() @IsString() @MaxLength(20) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(30) mersisNo?: string;
  @IsOptional() @IsString() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) kepAddress?: string;
  @IsOptional() @IsString() @MaxLength(200) website?: string;
  @IsOptional() @IsString() @MaxLength(200) jurisdiction?: string;
}

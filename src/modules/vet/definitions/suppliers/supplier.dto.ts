import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SUPPLIER_INVOICE_TYPES, SupplierInvoiceType } from './supplier.entity';

export class CreateSupplierDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxOffice?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mersisNo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string | null;

  @ApiPropertyOptional({ enum: SUPPLIER_INVOICE_TYPES })
  @IsOptional()
  @IsIn(SUPPLIER_INVOICE_TYPES)
  invoiceType?: SupplierInvoiceType | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}

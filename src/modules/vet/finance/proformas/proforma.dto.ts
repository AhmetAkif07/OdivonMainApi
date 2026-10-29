import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { SaleLineDto } from '../sales/sale.dto';
import { PROFORMA_STATUSES, ProformaStatus } from './proforma.entity';

export class CreateProformaDto {
  @ApiProperty()
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  validUntil?: string | null;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string | null;

  @ApiProperty({ type: [SaleLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines!: SaleLineDto[];
}

export class UpdateProformaDto extends PartialType(CreateProformaDto) {}

export const PROFORMA_MANUAL_STATUSES = ['draft', 'sent', 'accepted', 'rejected'] as const;

export class SetProformaStatusDto {
  @ApiProperty({ enum: PROFORMA_MANUAL_STATUSES })
  @IsIn(PROFORMA_MANUAL_STATUSES)
  status!: (typeof PROFORMA_MANUAL_STATUSES)[number];
}

export class ConvertProformaDto {
  @ApiPropertyOptional({ description: 'Sale date; defaults to now' })
  @IsOptional()
  @IsISO8601()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentMethodId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashRegisterId?: string | null;
}

export class ProformaQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: PROFORMA_STATUSES })
  @IsOptional()
  @IsIn(PROFORMA_STATUSES)
  status?: ProformaStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customerId?: string;
}

import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  COMMISSION_BASES,
  COMMISSION_KINDS,
  COMMISSION_SCOPES,
  CommissionBasis,
  CommissionKind,
  CommissionScope,
} from './commission.entity';

export class CreateCommissionRuleDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ enum: COMMISSION_KINDS })
  @IsIn(COMMISSION_KINDS)
  kind!: CommissionKind;

  @ApiPropertyOptional({ description: 'Staff uid; empty = everyone' })
  @IsOptional()
  @IsString()
  userId?: string | null;

  @ApiPropertyOptional({ description: 'Role id; applies to its members when no person is set' })
  @IsOptional()
  @IsString()
  roleId?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Active from, YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validFrom?: string | null;

  @ApiPropertyOptional({ description: 'Active until, YYYY-MM-DD' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  validTo?: string | null;

  @ApiPropertyOptional({ description: 'Commission rules: minimum base in the period before anything is paid' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minTotal?: number;

  @ApiPropertyOptional({ enum: COMMISSION_SCOPES, default: 'all' })
  @IsOptional()
  @IsIn(COMMISSION_SCOPES)
  scope?: CommissionScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  targetIds?: string[];

  @ApiPropertyOptional({ enum: COMMISSION_BASES, default: 'percent' })
  @IsOptional()
  @IsIn(COMMISSION_BASES)
  basis?: CommissionBasis;

  @ApiPropertyOptional({ description: 'Percent (0-100) or TL per unit' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  rate?: number;

  @ApiPropertyOptional({ description: 'Target rules: net sales to reach' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  threshold?: number;

  @ApiPropertyOptional({ description: 'Target rules: bonus amount' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;
}

export class UpdateCommissionRuleDto extends PartialType(CreateCommissionRuleDto) {}

export class CommissionReportQueryDto {
  @ApiProperty({ description: 'YYYY-MM-DD' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ description: 'YYYY-MM-DD (max 366 days after from)' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;
}

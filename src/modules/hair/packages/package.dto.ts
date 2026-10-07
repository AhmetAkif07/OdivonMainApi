import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DATE_ID, PaymentLineDto } from '../shared/hair-dto';

export class PackageServiceDto {
  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiPropertyOptional({ description: 'Ignored — resolved from the catalog' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  serviceName?: string;
}

export class CreateHairPackageDto {
  @ApiProperty({ example: '10 Seans Keratin' })
  @IsString()
  @Length(1, 120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ type: [PackageServiceDto], description: 'Services a session of this package may be used for' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => PackageServiceDto)
  services!: PackageServiceDto[];

  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(500)
  totalSessions!: number;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiProperty({ description: 'Days the package is valid after purchase' })
  @IsInt()
  @Min(1)
  @Max(3650)
  validityDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHairPackageDto extends PartialType(CreateHairPackageDto) {}

export class SellCustomerPackageDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  packageId!: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD, default today' })
  @IsOptional()
  @Matches(DATE_ID)
  startDate?: string;

  @ApiPropertyOptional({ description: 'Required when payments are given' })
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffId?: string;

  @ApiPropertyOptional({ type: [PaymentLineDto], description: 'Collected now; must add up to the package price' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => PaymentLineDto)
  payments?: PaymentLineDto[];
}

export class UpdateCustomerPackageDto {
  @ApiPropertyOptional({ enum: ['active', 'expired', 'completed', 'cancelled'] })
  @IsOptional()
  @IsIn(['active', 'expired', 'completed', 'cancelled'])
  status?: 'active' | 'expired' | 'completed' | 'cancelled';

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ID)
  endDate?: string;
}

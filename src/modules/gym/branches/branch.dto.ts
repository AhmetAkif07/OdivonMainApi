import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class OpeningHoursDto {
  @IsInt()
  day!: number;

  @IsString()
  open!: string;

  @IsString()
  close!: string;

  @IsBoolean()
  closed!: boolean;
}

export class CreateBranchDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string | null;

  @ApiProperty()
  @IsString()
  address!: string;

  @ApiProperty()
  @IsString()
  city!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string | null;

  @ApiProperty()
  @IsString()
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  website?: string | null;

  @ApiProperty()
  @IsInt()
  @Min(1)
  capacity!: number;

  @ApiPropertyOptional({ type: [OpeningHoursDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OpeningHoursDto)
  openingHours?: OpeningHoursDto[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  openDays?: number[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  managerName?: string | null;

  @ApiPropertyOptional({ enum: ['active', 'closed', 'maintenance'] })
  @IsOptional()
  @IsIn(['active', 'closed', 'maintenance'])
  status?: 'active' | 'closed' | 'maintenance';
}

export class UpdateBranchDto extends PartialType(CreateBranchDto) {}

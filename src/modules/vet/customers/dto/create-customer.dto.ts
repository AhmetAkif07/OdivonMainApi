import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { InitialPatientDto } from './initial-patient.dto';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

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
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  portalAccess?: boolean;

  @ApiPropertyOptional({ enum: ['active', 'invited', 'disabled'] })
  @IsOptional()
  @IsString()
  portalStatus?: 'active' | 'invited' | 'disabled';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  sendPortalInvite?: boolean;

  @ApiPropertyOptional({ type: () => InitialPatientDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialPatientDto)
  initialPatient?: InitialPatientDto;
}

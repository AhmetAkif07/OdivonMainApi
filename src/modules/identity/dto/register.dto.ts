import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';

export class RegisterDto {
  @ApiProperty({ example: 'clinic@example.com' })
  @IsEmail()
  email!: string;

  // No complexity rules on sign-up; 6 is Firebase Auth's own minimum.
  @ApiProperty({ minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Odivon Vet Clinic' })
  @IsString()
  @MinLength(2)
  tenantName!: string;

  @ApiPropertyOptional({ enum: PRODUCT_MODULES, default: 'vet' })
  @IsOptional()
  @IsIn(PRODUCT_MODULES)
  module?: ProductModule;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  displayName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;
}

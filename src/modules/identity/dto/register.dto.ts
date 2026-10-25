import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';

export class RegisterDto {
  @ApiProperty({ example: 'clinic@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10, description: 'Uppercase, lowercase, number and symbol required' })
  @IsString()
  @MinLength(10)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
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

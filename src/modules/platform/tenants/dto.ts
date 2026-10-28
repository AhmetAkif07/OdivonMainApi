import { IsArray, IsEnum, IsInt, IsISO8601, IsNotEmpty, IsOptional, IsPositive, IsString, Max } from 'class-validator';
import { ProductModule } from '../../../shared/authorization/constants';

export class ListTenantsQueryDto {
  @IsOptional()
  module?: string;

  @IsOptional()
  status?: 'active' | 'inactive';

  @IsOptional()
  membership?: 'trial' | 'active' | 'expired' | 'cancelled';

  @IsOptional()
  isDemo?: string; // 'true' | 'false'

  @IsOptional()
  emailVerified?: string; // owner e-mail verified: 'true' | 'false'

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  pageSize?: string;
}

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsArray()
  modules?: ProductModule[];
}

export class ExtendTenantDurationDto {
  @IsEnum(['trial', 'subscription'])
  target!: 'trial' | 'subscription';

  @IsInt()
  @IsPositive()
  @Max(3650) // Max 10 years
  days!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SetTenantExpiryDto {
  @IsEnum(['trial', 'subscription'])
  target!: 'trial' | 'subscription';

  @IsISO8601()
  endsAt!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class SuspendTenantDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

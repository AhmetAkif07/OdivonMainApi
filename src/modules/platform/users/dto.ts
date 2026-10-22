import { IsEnum, IsOptional, IsString } from 'class-validator';

export class ListUsersQueryDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';

  /** exists (default): Firebase Auth accounts. missing: Firestore profiles whose Auth account is gone. */
  @IsOptional()
  @IsEnum(['exists', 'missing', 'all'])
  auth?: 'exists' | 'missing' | 'all';

  @IsOptional()
  page?: string;

  @IsOptional()
  pageSize?: string;
}

export class DeletePlatformUserDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdatePlatformUserDto {
  @IsOptional()
  @IsEnum(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsString()
  displayName?: string;
}

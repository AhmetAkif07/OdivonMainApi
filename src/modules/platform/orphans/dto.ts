import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

export class DeleteOrphanTenantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  tenantIds!: string[];

  /** soft: hides the tenant (deletedAt), data stays. hard: removes the tenant and all its sub-collections. */
  @IsEnum(['soft', 'hard'])
  mode!: 'soft' | 'hard';

  @IsOptional()
  @IsString()
  reason?: string;
}

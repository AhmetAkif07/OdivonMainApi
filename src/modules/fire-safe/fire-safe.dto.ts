import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateFireSafeRecordDto {
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 80) location!: string;
  @IsOptional() @IsString() @Length(1, 80) facilityCode?: string;
  @IsOptional() @IsISO8601() inspectionDueAt?: string;
  @IsOptional() @IsIn(['active', 'pending']) status?: 'active' | 'pending';
}

export class UpdateFireSafeRecordDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @Length(2, 80) location?: string;
  @IsOptional() @IsString() @Length(1, 80) facilityCode?: string;
  @IsOptional() @IsISO8601() inspectionDueAt?: string;
  @IsOptional() @IsIn(['active', 'pending']) status?: 'active' | 'pending';
}

export class FireSafeListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() archived = false;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() cursor?: string;
}

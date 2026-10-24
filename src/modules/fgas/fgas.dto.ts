import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class CreateFgasRecordDto {
  @IsString() @Length(2, 160) name!: string;
  @IsString() @Length(2, 80) location!: string;
  @IsOptional() @IsString() @Length(1, 80) equipmentCode?: string;
  @IsOptional() @IsString() @Length(1, 80) refrigerant?: string;
  @IsOptional() @IsIn(['active', 'pending']) status?: 'active' | 'pending';
}

export class UpdateFgasRecordDto {
  @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() @Length(2, 160) name?: string;
  @IsOptional() @IsString() @Length(2, 80) location?: string;
  @IsOptional() @IsString() @Length(1, 80) equipmentCode?: string;
  @IsOptional() @IsString() @Length(1, 80) refrigerant?: string;
  @IsOptional() @IsIn(['active', 'pending']) status?: 'active' | 'pending';
}

export class FgasListQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() archived = false;
  @IsOptional() @Transform(({ value }) => Number(value)) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional() @IsString() cursor?: string;
}

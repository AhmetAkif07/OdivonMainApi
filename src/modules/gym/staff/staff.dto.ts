import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string | null;

  @ApiPropertyOptional({ enum: ['owner', 'admin', 'trainer', 'receptionist', 'user'] })
  @IsOptional()
  @IsIn(['owner', 'admin', 'trainer', 'receptionist', 'user'])
  role?: 'owner' | 'admin' | 'trainer' | 'receptionist' | 'user';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialties?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customPermissions?: string[];

  @ApiPropertyOptional({ enum: ['active', 'inactive', 'leave'] })
  @IsOptional()
  @IsIn(['active', 'inactive', 'leave'])
  status?: 'active' | 'inactive' | 'leave';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hireDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContact?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  monthlySalary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  commissionRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateStaffDto extends PartialType(CreateStaffDto) {}

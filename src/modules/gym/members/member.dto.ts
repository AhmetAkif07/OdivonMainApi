import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';

export class CreateMemberDto {
  @ApiProperty()
  @IsString()
  displayName!: string;

  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: ['female', 'male', 'unspecified'] })
  @IsOptional()
  @IsIn(['female', 'male', 'unspecified'])
  gender?: 'female' | 'male' | 'unspecified';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  birthDate?: string | null;

  @ApiPropertyOptional({ enum: ['trial', 'active', 'expired', 'cancelled'] })
  @IsOptional()
  @IsIn(['trial', 'active', 'expired', 'cancelled'])
  membershipStatus?: 'trial' | 'active' | 'expired' | 'cancelled';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  packageLabel?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  packagePrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  membershipStartDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  membershipEndDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  memberNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainerName?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactRelation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bloodGroup?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chronicDiseases?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialInfo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoURL?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rfidCardNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cardDepositFee?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cardDepositPaid?: boolean;
}

export class UpdateMemberDto extends PartialType(OmitType(CreateMemberDto, ['email', 'password'] as const)) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;
}

export class RenewMemberDto {
  @ApiProperty()
  @IsString()
  packageName!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  durationDays!: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class FreezeMemberDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  freezeDays!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelMemberDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ListMembersQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  q?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : value === true || value === 'true'))
  @IsBoolean()
  archived?: boolean;
}

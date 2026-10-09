import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { DATE_ID } from '../shared/hair-dto';

export const CUSTOMER_SOURCES = ['walk-in', 'online', 'referral', 'phone'] as const;
export const GENDERS = ['male', 'female', 'other'] as const;

export class CreateHairCustomerDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @Length(0, 80)
  lastName!: string;

  @ApiProperty({ example: '+905321234567', description: 'Unique per salon; normalised to E.164' })
  @IsString()
  @MaxLength(32)
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  email?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: (typeof GENDERS)[number];

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @Matches(DATE_ID)
  birthDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ description: 'Allergy / sensitivity note (dye, chemicals)' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  allergies?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(DATE_ID)
  lastPatchTestDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredStaffId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredBranchId?: string;

  @ApiPropertyOptional({ enum: CUSTOMER_SOURCES })
  @IsOptional()
  @IsIn(CUSTOMER_SOURCES)
  source?: (typeof CUSTOMER_SOURCES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentWhatsapp?: boolean;

  @ApiPropertyOptional({ description: 'İYS commercial message consent (birthday, re-engagement)' })
  @IsOptional()
  @IsBoolean()
  consentCommercialIys?: boolean;

  @ApiPropertyOptional({ description: 'KVKK consent for taking / storing photos' })
  @IsOptional()
  @IsBoolean()
  consentPhotos?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateHairCustomerDto extends PartialType(CreateHairCustomerDto) {}

export class MergeHairCustomerDto {
  @ApiProperty({ description: 'Duplicate customer merged INTO the path customer, then removed' })
  @IsString()
  sourceId!: string;
}

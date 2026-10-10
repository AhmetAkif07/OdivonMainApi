import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export const CONSENT_TYPES = [
  'kvkk_general',
  'commercial_communication',
  'health_biometric',
  'camera_cctv',
  'cookie_policy',
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_CHANNELS = [
  'ADMIN_PANEL',
  'MEMBER_PORTAL',
  'MOBILE_APP',
  'KIOSK',
  'SMS_OTP',
] as const;

export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export class UpsertConsentTextDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  @IsIn(CONSENT_TYPES)
  type!: ConsentType;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ default: '1.0' })
  @IsString()
  version!: string;

  @ApiProperty()
  @IsString()
  contentHtml!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class RecordConsentItemDto {
  @ApiProperty({ enum: CONSENT_TYPES })
  @IsIn(CONSENT_TYPES)
  consentType!: ConsentType;

  @ApiProperty({ default: '1.0' })
  @IsString()
  version!: string;

  @ApiProperty()
  @IsBoolean()
  granted!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RecordMemberConsentsDto {
  @ApiProperty()
  @IsString()
  memberId!: string;

  @ApiProperty()
  @IsString()
  memberFullName!: string;

  @ApiPropertyOptional({ enum: CONSENT_CHANNELS, default: 'ADMIN_PANEL' })
  @IsOptional()
  @IsIn(CONSENT_CHANNELS)
  channel?: ConsentChannel;

  @ApiProperty({ type: [RecordConsentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecordConsentItemDto)
  consents!: RecordConsentItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class RevokeConsentDto {
  @ApiProperty()
  @IsString()
  memberId!: string;

  @ApiProperty({ enum: CONSENT_TYPES })
  @IsIn(CONSENT_TYPES)
  consentType!: ConsentType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ enum: CONSENT_CHANNELS, default: 'ADMIN_PANEL' })
  @IsOptional()
  @IsIn(CONSENT_CHANNELS)
  channel?: ConsentChannel;
}

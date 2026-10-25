import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// ---------- Mail ----------

export class MailListQueryDto {
  @IsOptional() @IsString() mailbox?: string;
  @IsOptional() @IsString() folder?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() perPage?: string;
  /** Free text: matches headers and body. */
  @IsOptional() @IsString() q?: string;
  /** 'true' lists unread messages only. */
  @IsOptional() @IsString() unseen?: string;
}

export class MailMessageQueryDto {
  @IsOptional() @IsString() mailbox?: string;
  @IsOptional() @IsString() folder?: string;
}

export class MailFlagsDto {
  @IsOptional() @IsBoolean() seen?: boolean;
  @IsOptional() @IsBoolean() flagged?: boolean;
}

export class MailMoveDto {
  @IsString() @IsNotEmpty() targetFolder!: string;
}

export class MailRefDto {
  @Type(() => Number) @IsInt() @Min(1) uid!: number;
  @IsString() @IsNotEmpty() folder!: string;
}

export class SendMailDto {
  @IsOptional() @IsString() mailbox?: string;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsEmail({}, { each: true })
  to!: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true })
  cc?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsEmail({}, { each: true })
  bcc?: string[];

  @IsString() @IsNotEmpty() @MaxLength(300)
  subject!: string;

  @IsString() @IsNotEmpty() @MaxLength(200_000)
  body!: string;

  @IsOptional() @IsEnum(['text', 'html'])
  bodyFormat?: 'text' | 'html';

  /** Wrap the body in the Odivon mail layout. Defaults to true for new mails, false for replies. */
  @IsOptional() @IsBoolean()
  useLayout?: boolean;

  @IsOptional() @ValidateNested() @Type(() => MailRefDto)
  inReplyTo?: MailRefDto;

  @IsOptional() @ValidateNested() @Type(() => MailRefDto)
  forwardOf?: MailRefDto;
}

// ---------- Audience ----------

export class AudienceDto {
  @IsOptional() @IsArray() @IsString({ each: true })
  modules?: string[];

  @IsOptional() @IsEnum(['active', 'inactive', 'all'])
  tenantStatus?: 'active' | 'inactive' | 'all';

  @IsOptional() @IsArray() @IsEnum(['trial', 'active', 'expired', 'cancelled'], { each: true })
  membership?: Array<'trial' | 'active' | 'expired' | 'cancelled'>;

  @IsOptional() @IsBoolean()
  includeDemo?: boolean;

  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsString({ each: true })
  tenantIds?: string[];

  @IsOptional() @IsEnum(['owners', 'staff'])
  recipients?: 'owners' | 'staff';

  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsEmail({}, { each: true })
  extraEmails?: string[];
}

// ---------- Campaigns ----------

export type CampaignChannel = 'email' | 'notification';
export type NotificationLevel = 'info' | 'success' | 'warning' | 'critical';

export class CreateCampaignDto {
  @IsString() @IsNotEmpty() @MaxLength(120)
  name!: string;

  @IsString() @IsNotEmpty() @MaxLength(300)
  subject!: string;

  @IsString() @IsNotEmpty() @MaxLength(200_000)
  body!: string;

  @IsOptional() @IsEnum(['text', 'html'])
  bodyFormat?: 'text' | 'html';

  @IsArray() @ArrayMinSize(1) @IsEnum(['email', 'notification'], { each: true })
  channels!: CampaignChannel[];

  @ValidateNested() @Type(() => AudienceDto)
  audience!: AudienceDto;

  @IsOptional() @IsUrl({ require_protocol: true })
  ctaUrl?: string;

  @IsOptional() @IsString() @MaxLength(60)
  ctaLabel?: string;

  @IsOptional() @IsEnum(['info', 'success', 'warning', 'critical'])
  notificationLevel?: NotificationLevel;

  /** Sent automatically by the hourly job once this time has passed. */
  @IsOptional() @IsISO8601()
  scheduledAt?: string;

  @IsOptional() @IsString()
  mailbox?: string;
}

export class UpdateCampaignDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(300) subject?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200_000) body?: string;
  @IsOptional() @IsEnum(['text', 'html']) bodyFormat?: 'text' | 'html';
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsEnum(['email', 'notification'], { each: true }) channels?: CampaignChannel[];
  @IsOptional() @ValidateNested() @Type(() => AudienceDto) audience?: AudienceDto;
  @IsOptional() @IsString() ctaUrl?: string;
  @IsOptional() @IsString() @MaxLength(60) ctaLabel?: string;
  @IsOptional() @IsEnum(['info', 'success', 'warning', 'critical']) notificationLevel?: NotificationLevel;
  /** Empty string clears the schedule. */
  @IsOptional() @IsString() scheduledAt?: string;
  @IsOptional() @IsString() mailbox?: string;
}

export class TestCampaignDto {
  @IsEmail()
  to!: string;
}

export class PreviewAudienceDto {
  @ValidateNested() @Type(() => AudienceDto)
  audience!: AudienceDto;
}

// ---------- Notifications ----------

export class SendNotificationDto {
  @IsString() @IsNotEmpty() @MaxLength(140)
  title!: string;

  @IsString() @IsNotEmpty() @MaxLength(4000)
  body!: string;

  @IsOptional() @IsEnum(['info', 'success', 'warning', 'critical'])
  level?: NotificationLevel;

  @IsOptional() @IsUrl({ require_protocol: true })
  link?: string;

  @IsOptional() @IsString() @MaxLength(60)
  linkLabel?: string;

  @ValidateNested() @Type(() => AudienceDto)
  audience!: AudienceDto;

  /** Also e-mail the notification to the recipients of each tenant. */
  @IsOptional() @IsBoolean()
  alsoEmail?: boolean;

  /** Hide the notification from tenants after this time. */
  @IsOptional() @IsISO8601()
  expiresAt?: string;
}

export class TenantNotificationsQueryDto {
  @IsOptional() @IsString() unreadOnly?: string;
  @IsOptional() @IsString() limit?: string;
}

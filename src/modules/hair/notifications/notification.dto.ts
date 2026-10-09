import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export const NOTIFICATION_CHANNELS = ['sms', 'email', 'push', 'whatsapp', 'in-app'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export class SendHairNotificationDto {
  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsString()
  @Length(1, 160)
  title!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 2000)
  body!: string;

  @ApiPropertyOptional({ description: 'Staff user id (in-app / push); omitted = everyone in the branch' })
  @IsOptional()
  @IsString()
  recipientId?: string;

  @ApiPropertyOptional({ description: 'Customer (sms / email / whatsapp)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  type?: string;
}

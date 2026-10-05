import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import {
  COMMUNICATION_CATEGORIES,
  COMMUNICATION_CHANNELS,
  CommunicationCategory,
  CommunicationChannel,
} from '../entities/communication-log.entity';

export class CreateCommunicationLogDto {
  @ApiProperty({ enum: COMMUNICATION_CHANNELS })
  @IsIn(COMMUNICATION_CHANNELS)
  channel!: CommunicationChannel;

  @ApiProperty({ enum: COMMUNICATION_CATEGORIES })
  @IsIn(COMMUNICATION_CATEGORIES)
  category!: CommunicationCategory;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recipientPhone!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  recipientName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  messageContent!: string;

  @ApiPropertyOptional({ enum: ['sent', 'pending', 'failed'], default: 'sent' })
  @IsOptional()
  @IsIn(['sent', 'pending', 'failed'])
  status?: 'sent' | 'pending' | 'failed' = 'sent';
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import {
  COMMUNICATION_CATEGORIES,
  COMMUNICATION_CHANNELS,
  CommunicationCategory,
  CommunicationChannel,
} from '../entities/communication-log.entity';

export class ListCommunicationLogsQueryDto extends PagingQueryDto {
  @ApiPropertyOptional({ enum: COMMUNICATION_CHANNELS })
  @IsOptional()
  @IsIn(COMMUNICATION_CHANNELS)
  channel?: CommunicationChannel;

  @ApiPropertyOptional({ enum: COMMUNICATION_CATEGORIES })
  @IsOptional()
  @IsIn(COMMUNICATION_CATEGORIES)
  category?: CommunicationCategory;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

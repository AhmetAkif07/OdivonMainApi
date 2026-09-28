import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';

export const SYNC_STATUSES = ['pending', 'delivered', 'applied', 'error'] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export class CreatePairingCodeDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  gateIds!: string[];
}

export class EnrollAgentDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  hostname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string;
}

export class AgentWorkQueryDto {
  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class AgentAckDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  version!: number;

  @ApiProperty({ enum: ['applied', 'error'] })
  @IsIn(['applied', 'error'])
  result!: 'applied' | 'error';

  @ApiProperty()
  @IsBoolean()
  verified!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;
}

export class AgentEventDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  gateId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  eventId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  userId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  card?: string | null;

  @ApiProperty()
  @IsString()
  @MaxLength(64)
  time!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(16)
  direction?: string | null;

  @ApiPropertyOptional({ enum: ['granted', 'denied'], nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  result?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  verifyMode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}

export class AgentEventsBatchDto {
  @ApiProperty({ type: [AgentEventDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => AgentEventDto)
  events!: AgentEventDto[];
}

export class HeartbeatDeviceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(128)
  gateId!: string;

  @ApiProperty()
  @IsBoolean()
  reachable!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lastError?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  lastEventAt?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceTime?: string | null;
}

export class AgentHeartbeatDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  agentVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  queueDepth?: number;

  @ApiProperty({ type: [HeartbeatDeviceDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => HeartbeatDeviceDto)
  devices!: HeartbeatDeviceDto[];
}

export class SyncListQueryDto extends PagingQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gateId?: string;

  @ApiPropertyOptional({ enum: SYNC_STATUSES })
  @IsOptional()
  @IsIn(SYNC_STATUSES)
  status?: SyncStatus;
}

export class ResyncDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  gateId!: string;
}

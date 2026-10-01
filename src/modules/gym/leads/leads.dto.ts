import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { LEAD_STAGES, LeadStage } from './leads.rules';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export class FunnelQueryDto {
  @ApiPropertyOptional({ example: '2026-09-01', description: 'Bu günden (dahil) sonra oluşturulan adaylar' })
  @IsOptional()
  @Matches(DAY)
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Matches(DAY)
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  branchId?: string;
}

export class LeadStageDto {
  @ApiProperty({ enum: LEAD_STAGES })
  @IsIn(LEAD_STAGES)
  stage!: LeadStage;

  @ApiPropertyOptional({ description: 'Kaybedilme nedeni (stage = lost)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  lostReason?: string;
}

export class ConvertLeadDto {
  @ApiProperty({ description: 'Adaydan oluşturulan (veya eşleşen) üyenin uid değeri' })
  @IsString()
  memberId!: string;
}

export class RecordReferralDto {
  @ApiProperty({ description: 'Tavsiye eden üye' })
  @IsString()
  referrerMemberId!: string;

  @ApiProperty({ description: 'Tavsiyeyle gelen yeni üye' })
  @IsString()
  memberId!: string;
}

export class ReferralSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['wallet', 'days'] })
  @IsOptional()
  @IsIn(['wallet', 'days'])
  rewardType?: 'wallet' | 'days';

  @ApiPropertyOptional({ description: 'Cüzdana eklenecek TL' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  rewardAmount?: number;

  @ApiPropertyOptional({ description: 'Aktif üyeliğe eklenecek gün' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  rewardDays?: number;
}

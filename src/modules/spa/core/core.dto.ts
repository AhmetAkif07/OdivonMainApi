import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

const CLOCK = /^[0-2][0-9]:[0-5][0-9]$/;

export class UpdateSpaSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @ApiPropertyOptional({ example: 'Europe/Istanbul' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ example: 'TRY' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(CLOCK)
  workDayStart?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @Matches(CLOCK)
  workDayEnd?: string;
}

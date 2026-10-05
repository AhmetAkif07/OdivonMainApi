import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateVitalLogDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  loggedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temp?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  pulse?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  respiratoryRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ enum: ['good', 'medium', 'none'] })
  @IsOptional()
  @IsIn(['good', 'medium', 'none'])
  appetite?: 'good' | 'medium' | 'none';

  @ApiPropertyOptional({ enum: ['normal', 'diarrhea', 'none'] })
  @IsOptional()
  @IsIn(['normal', 'diarrhea', 'none'])
  defecation?: 'normal' | 'diarrhea' | 'none';

  @ApiPropertyOptional({ enum: ['normal', 'abnormal', 'none'] })
  @IsOptional()
  @IsIn(['normal', 'abnormal', 'none'])
  urination?: 'normal' | 'abnormal' | 'none';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffName?: string;
}

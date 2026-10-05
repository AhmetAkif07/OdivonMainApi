import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateHotelDailyLogDto {
  @ApiProperty()
  @IsString()
  stayId!: string;

  @ApiProperty()
  @IsString()
  date!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  morningMeal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  morningMealNotes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  eveningMeal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eveningMealNotes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  morningWalk?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  eveningWalk?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  medicationGiven?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  medicationNotes?: string;

  @ApiPropertyOptional({ default: 'normal' })
  @IsOptional()
  @IsIn(['normal', 'abnormal', 'none'])
  urination?: 'normal' | 'abnormal' | 'none';

  @ApiPropertyOptional({ default: 'normal' })
  @IsOptional()
  @IsIn(['normal', 'diarrhea', 'constipated', 'none'])
  defecation?: 'normal' | 'diarrhea' | 'constipated' | 'none';

  @ApiPropertyOptional({ default: 'happy' })
  @IsOptional()
  @IsIn(['happy', 'calm', 'anxious', 'aggressive', 'lethargic'])
  mood?: 'happy' | 'calm' | 'anxious' | 'aggressive' | 'lethargic';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  staffName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  photoUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  whatsAppNotified?: boolean;
}

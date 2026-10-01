import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { REMINDER_TYPES, ReminderType } from './reminders.rules';

export class ReminderTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(480)
  body?: string;
}

export class ReminderTemplatesDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplateDto)
  membership_expiring?: ReminderTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplateDto)
  installment_overdue?: ReminderTemplateDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplateDto)
  inactive_member?: ReminderTemplateDto;
}

export class ReminderSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Otomatik SMS; varsayılan kapalı' })
  @IsOptional()
  @IsBoolean()
  smsEnabled?: boolean;

  @ApiPropertyOptional({ type: [Number], description: 'Üyelik bitişine kalan gün eşikleri' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(60, { each: true })
  expiryDays?: number[];

  @ApiPropertyOptional({ type: [Number], description: 'Taksit gecikme günü eşikleri' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(365, { each: true })
  overdueDays?: number[];

  @ApiPropertyOptional({ description: 'Bu kadar gün gelmeyen üyeye hatırlatma' })
  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(90)
  inactiveDays?: number;

  @ApiPropertyOptional({ description: 'Yer tutucular: {ad} {gun} {paket} {bitis} {tutar} {vade} {gecikme}' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderTemplatesDto)
  templates?: ReminderTemplatesDto;
}

export class ListRemindersQueryDto {
  @ApiPropertyOptional({ description: 'YYYY-MM-DD (salon günü); varsayılan bugün' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day?: string;

  @ApiPropertyOptional({ enum: REMINDER_TYPES })
  @IsOptional()
  @IsIn(REMINDER_TYPES)
  type?: ReminderType;
}

export class RunRemindersDto {
  @ApiPropertyOptional({ description: 'true: kaydetmeden ve göndermeden önizleme' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

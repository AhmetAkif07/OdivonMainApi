import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateClinicParametersDto {
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  appointmentStart?: string;

  @ApiPropertyOptional({ example: '19:00' })
  @IsOptional()
  @Matches(TIME_PATTERN)
  appointmentEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(180)
  appointmentInterval?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(240)
  sessionDuration?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  appointmentReminderHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  agendaReminderHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  displayVetNo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoSms?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  animalBreedsRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  firstInspectionRequired?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  examinationAmountZero?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cashRegisterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cardCashRegisterId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  transferCashRegisterId?: string | null;
}

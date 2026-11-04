import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  AGENDA_FREQUENCIES,
  AGENDA_PRIORITIES,
  AGENDA_SCOPES,
  AGENDA_TYPES,
  AgendaFrequency,
  AgendaPriority,
  AgendaScope,
  AgendaType,
} from './agenda.entity';

export class AgendaRecurrenceDto {
  @ApiProperty({ enum: AGENDA_FREQUENCIES })
  @IsIn(AGENDA_FREQUENCIES)
  frequency!: AgendaFrequency;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 99 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  interval: number = 1;

  @ApiPropertyOptional({ type: [Number], description: 'Weekly only: 0 = Sunday … 6 = Saturday' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional({ description: 'Last day, YYYY-MM-DD' })
  @IsOptional()
  @IsISO8601()
  until?: string | null;

  @ApiPropertyOptional({ minimum: 1, maximum: 366 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  count?: number | null;

  @ApiPropertyOptional({ description: 'Minutes east of UTC (Türkiye = 180)', default: 180 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-720)
  @Max(840)
  utcOffsetMinutes?: number;
}

export class CreateAgendaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ enum: AGENDA_TYPES })
  @IsIn(AGENDA_TYPES)
  type!: AgendaType;

  @ApiProperty({ enum: AGENDA_PRIORITIES })
  @IsIn(AGENDA_PRIORITIES)
  priority!: AgendaPriority;

  @ApiProperty()
  @IsISO8601()
  dueAt!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ type: AgendaRecurrenceDto, nullable: true, description: 'Repeat the task' })
  @IsOptional()
  @ValidateNested()
  @Type(() => AgendaRecurrenceDto)
  recurrence?: AgendaRecurrenceDto | null;
}

export class UpdateAgendaDto extends PartialType(CreateAgendaDto) {}

export class AgendaScopeQueryDto {
  @ApiPropertyOptional({
    enum: AGENDA_SCOPES,
    default: 'single',
    description: 'Repeating tasks: this one, this and the following ones, or the whole series',
  })
  @IsOptional()
  @IsIn(AGENDA_SCOPES)
  scope?: AgendaScope;
}


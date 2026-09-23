import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AGENDA_PRIORITIES, AGENDA_TYPES, AgendaPriority, AgendaType } from './agenda.entity';

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
}

export class UpdateAgendaDto extends PartialType(CreateAgendaDto) {}

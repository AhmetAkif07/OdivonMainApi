import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsISO8601, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AppointmentLineDto } from './appointment-line.dto';

export class CreateAppointmentDto {
  @ApiProperty()
  @IsISO8601()
  beginAt!: string;

  @ApiProperty()
  @IsISO8601()
  endAt!: string;

  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  patientId!: string;

  @ApiProperty({ description: 'Firebase Auth UID of the doctor' })
  @IsString()
  doctorId!: string;

  @ApiProperty({ example: 'checkup' })
  @IsString()
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ type: [AppointmentLineDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AppointmentLineDto)
  plannedLines?: AppointmentLineDto[];
}

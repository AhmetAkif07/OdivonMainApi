import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsString } from 'class-validator';

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
}

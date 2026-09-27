import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

export const APPOINTMENT_STATUSES = [
  'Bekliyor',
  'Onaylandı',
  'Geldi',
  'Tamamlandı',
  'Gelmedi',
  'İptal',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses from which an appointment can still be edited or checked out. */
export const OPEN_APPOINTMENT_STATUSES: readonly AppointmentStatus[] = [
  'Bekliyor',
  'Onaylandı',
  'Geldi',
];

/** Statuses a user may set by hand; `Tamamlandı` is only set by a POS checkout. */
export const MANUAL_APPOINTMENT_STATUSES = [
  'Bekliyor',
  'Onaylandı',
  'Geldi',
  'Gelmedi',
  'İptal',
] as const;

export class SaveSpaAppointmentDto {
  @ApiProperty()
  @IsString()
  customerId!: string;

  @ApiProperty()
  @IsString()
  staffId!: string;

  @ApiProperty()
  @IsString()
  roomId!: string;

  @ApiProperty()
  @IsString()
  serviceId!: string;

  @ApiProperty({ description: 'ISO instant' })
  @IsISO8601()
  start!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class SetSpaAppointmentStatusDto {
  @ApiProperty({ enum: MANUAL_APPOINTMENT_STATUSES })
  @IsIn(MANUAL_APPOINTMENT_STATUSES)
  status!: (typeof MANUAL_APPOINTMENT_STATUSES)[number];
}

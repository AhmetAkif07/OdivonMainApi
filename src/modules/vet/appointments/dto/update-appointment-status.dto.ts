import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { APPOINTMENT_STATUSES, AppointmentStatus } from '../entities/appointment.entity';

export class UpdateAppointmentStatusDto {
  @ApiProperty({ enum: APPOINTMENT_STATUSES })
  @IsIn(APPOINTMENT_STATUSES)
  status!: AppointmentStatus;
}

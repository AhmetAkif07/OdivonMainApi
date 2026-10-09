import { PartialType } from '@nestjs/swagger';
import { CreateGroomingAppointmentDto } from './create-grooming-appointment.dto';

export class UpdateGroomingAppointmentDto extends PartialType(CreateGroomingAppointmentDto) {}
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
import { AppointmentsRepository } from './appointments.repository';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { AppointmentStatus } from './entities/appointment.entity';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly appointments: AppointmentsRepository,
    private readonly customers: CustomersRepository,
    private readonly patients: PatientsRepository,
  ) {}

  async create(dto: CreateAppointmentDto) {
    await this.assertCustomerPatient(dto.customerId, dto.patientId);
    return this.appointments.create(dto);
  }

  getById(id: string) {
    return this.appointments.getByIdOrThrow(id);
  }

  list(query: ListAppointmentsQueryDto) {
    return this.appointments.list(query);
  }

  async update(id: string, dto: UpdateAppointmentDto) {
    const current = await this.appointments.getByIdOrThrow(id);
    await this.assertCustomerPatient(
      dto.customerId ?? current.customerId,
      dto.patientId ?? current.patientId,
    );
    return this.appointments.update(id, dto);
  }

  updateStatus(id: string, status: AppointmentStatus) {
    return this.appointments.updateStatus(id, status);
  }

  softDelete(id: string) {
    return this.appointments.softDelete(id);
  }

  private async assertCustomerPatient(customerId: string, patientId: string): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new AppException(
        ErrorCode.APPOINTMENT_INVALID,
        'customerId does not belong to the current tenant',
      );
    }
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new AppException(
        ErrorCode.APPOINTMENT_INVALID,
        'patientId does not belong to the current tenant',
      );
    }
    if (patient.customerId !== customerId) {
      throw new AppException(
        ErrorCode.APPOINTMENT_INVALID,
        'patient does not belong to the given customer',
      );
    }
  }
}

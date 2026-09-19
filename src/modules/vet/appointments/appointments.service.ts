import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { hasColumnFilters, matchesColumnFilters } from '../../../shared/http/column-filters';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
import { Appointment, AppointmentListItem, AppointmentStatus } from './entities/appointment.entity';
import { AppointmentsRepository } from './appointments.repository';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';

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

  async list(query: ListAppointmentsQueryDto): Promise<PaginatedResult<AppointmentListItem>> {
    if (!hasColumnFilters(query.filters)) {
      const page = await this.appointments.list(query);
      return new PaginatedResult(await this.withNames(page.items), page.limit, page.nextCursor);
    }
    const filtered = (await this.withNames(await this.appointments.collect(query))).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(filtered, query.limit, query.cursor);
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

  private async withNames(items: Appointment[]): Promise<AppointmentListItem[]> {
    const [customers, patients] = await Promise.all([
      this.customers.findByIds(items.map((item) => item.customerId)),
      this.patients.findByIds(items.map((item) => item.patientId)),
    ]);
    return items.map((item) => {
      const customer = customers.get(item.customerId);
      const patient = patients.get(item.patientId);
      return {
        ...item,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
        patientName: patient
          ? patient.animalType
            ? `${patient.name} (${patient.animalType})`
            : patient.name
          : '',
      };
    });
  }
}

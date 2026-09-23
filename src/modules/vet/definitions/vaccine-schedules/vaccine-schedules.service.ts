import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { CustomersRepository } from '../../customers/customers.repository';
import { PatientsRepository } from '../../patients/patients.repository';
import { VaccinesRepository } from '../vaccines/vaccines.repository';
import {
  CreateVaccineScheduleDto,
  ListVaccineSchedulesQueryDto,
  UpdateVaccineScheduleDto,
} from './vaccine-schedule.dto';
import { VaccineSchedule, VaccineScheduleListItem } from './vaccine-schedule.entity';
import { VaccineSchedulesRepository } from './vaccine-schedules.repository';

@Injectable()
export class VaccineSchedulesService {
  constructor(
    private readonly schedules: VaccineSchedulesRepository,
    private readonly vaccines: VaccinesRepository,
    private readonly patients: PatientsRepository,
    private readonly customers: CustomersRepository,
  ) {}

  async create(dto: CreateVaccineScheduleDto) {
    const link = await this.resolveLink(dto.patientId, dto.vaccineId);
    return this.schedules.create({ ...dto, ...link });
  }

  getById(id: string) {
    return this.schedules.getByIdOrThrow(id);
  }

  async list(query: ListVaccineSchedulesQueryDto): Promise<PaginatedResult<VaccineScheduleListItem>> {
    const items = (await this.withNames(await this.schedules.collect(query))).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateVaccineScheduleDto) {
    const current = await this.schedules.getByIdOrThrow(id);
    const link = await this.resolveLink(dto.patientId ?? current.patientId, dto.vaccineId ?? current.vaccineId);
    return this.schedules.update(id, dto, link);
  }

  softDelete(id: string) {
    return this.schedules.softDelete(id);
  }

  private async resolveLink(patientId: string, vaccineId: string) {
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new AppException(ErrorCode.PATIENT_INVALID, 'Hasta bulunamadı');
    }
    const customer = await this.customers.findById(patient.customerId);
    if (!customer) {
      throw new AppException(ErrorCode.CUSTOMER_INVALID, 'Müşteri bulunamadı');
    }
    const vaccine = await this.vaccines.findById(vaccineId);
    if (!vaccine) {
      throw new AppException(ErrorCode.DEFINITION_INVALID, 'Seçilen aşı protokolü bulunamadı');
    }
    return {
      customerId: patient.customerId,
      vaccineName: vaccine.name,
      animalType: vaccine.animalType,
    };
  }

  private async withNames(items: VaccineSchedule[]): Promise<VaccineScheduleListItem[]> {
    const [patients, customers] = await Promise.all([
      this.patients.findByIds(items.map((item) => item.patientId)),
      this.customers.findByIds(items.map((item) => item.customerId)),
    ]);
    return items.map((item) => {
      const customer = customers.get(item.customerId);
      return {
        ...item,
        patientName: patients.get(item.patientId)?.name ?? '',
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
      };
    });
  }
}

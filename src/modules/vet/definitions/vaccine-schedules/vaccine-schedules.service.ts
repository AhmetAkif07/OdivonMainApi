import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { CustomersRepository } from '../../customers/customers.repository';
import { PatientsRepository } from '../../patients/patients.repository';
import { StockLedgerService } from '../../stock/stock-ledger.service';
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
    @Inject(forwardRef(() => StockLedgerService)) private readonly ledger: StockLedgerService,
  ) {}

  async create(dto: CreateVaccineScheduleDto) {
    const link = await this.resolveLink(dto.patientId, dto.vaccineId);
    const item = await this.schedules.create({ ...dto, ...link });
    await this.syncStock(item);
    return item;
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
    const item = await this.schedules.update(id, dto, link);
    await this.syncStock(item);
    return item;
  }

  async softDelete(id: string) {
    await this.schedules.softDelete(id);
    await this.ledger.clear({ type: 'vaccine', id });
  }

  private async syncStock(item: VaccineSchedule): Promise<void> {
    const source = { type: 'vaccine' as const, id: item.id };
    if (!item.done) {
      await this.ledger.clear(source);
      return;
    }
    const vaccine = await this.vaccines.getByIdOrThrow(item.vaccineId);
    await this.ledger.apply(
      source,
      'out',
      'vaccine',
      (vaccine.medicines ?? []).map((medicine) => ({
        productId: medicine.productId,
        quantity: medicine.quantity,
        unitPrice: medicine.salesAmount,
        date: item.doneAt ?? item.dueAt,
        remark: vaccine.name,
      })),
    );
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

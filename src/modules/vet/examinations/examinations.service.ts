import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { hasColumnFilters, matchesColumnFilters } from '../../../shared/http/column-filters';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
import { Examination, ExaminationListItem } from './entities/examination.entity';
import { CreateExaminationDto } from './dto/create-examination.dto';
import { ListExaminationsQueryDto } from './dto/list-examinations.query.dto';
import { UpdateExaminationDto } from './dto/update-examination.dto';
import { ExaminationsRepository } from './examinations.repository';

@Injectable()
export class ExaminationsService {
  constructor(
    private readonly examinations: ExaminationsRepository,
    private readonly customers: CustomersRepository,
    private readonly patients: PatientsRepository,
  ) {}

  async create(dto: CreateExaminationDto) {
    await this.assertCustomerPatient(dto.customerId, dto.patientId);
    return this.examinations.create(dto);
  }

  getById(id: string) {
    return this.examinations.getByIdOrThrow(id);
  }

  async list(query: ListExaminationsQueryDto): Promise<PaginatedResult<ExaminationListItem>> {
    if (!hasColumnFilters(query.filters)) {
      const page = await this.examinations.list(query);
      return new PaginatedResult(await this.withNames(page.items), page.limit, page.nextCursor);
    }
    const filtered = (await this.withNames(await this.examinations.collect(query))).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(filtered, query.limit, query.cursor);
  }

  update(id: string, dto: UpdateExaminationDto) {
    return this.examinations.update(id, dto);
  }

  softDelete(id: string) {
    return this.examinations.softDelete(id);
  }

  private async assertCustomerPatient(customerId: string, patientId: string): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new AppException(
        ErrorCode.PATIENT_INVALID,
        'customerId does not belong to the current tenant',
      );
    }
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new AppException(
        ErrorCode.PATIENT_INVALID,
        'patientId does not belong to the current tenant',
      );
    }
    if (patient.customerId !== customerId) {
      throw new AppException(
        ErrorCode.PATIENT_INVALID,
        'patient does not belong to the given customer',
      );
    }
  }

  private async withNames(items: Examination[]): Promise<ExaminationListItem[]> {
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

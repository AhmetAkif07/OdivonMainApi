import { Injectable } from '@nestjs/common';
import { CustomersRepository } from '../customers/customers.repository';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { hasColumnFilters, matchesColumnFilters } from '../../../shared/http/column-filters';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient, PatientListItem } from './entities/patient.entity';
import { PatientsRepository } from './patients.repository';

@Injectable()
export class PatientsService {
  constructor(
    private readonly patients: PatientsRepository,
    private readonly customers: CustomersRepository,
  ) {}

  async create(dto: CreatePatientDto) {
    await this.assertCustomer(dto.customerId);
    return this.patients.create(dto);
  }

  getById(id: string) {
    return this.patients.getByIdOrThrow(id);
  }

  async list(query: ListPatientsQueryDto): Promise<PaginatedResult<PatientListItem>> {
    if (!hasColumnFilters(query.filters)) {
      const page = await this.patients.list(query);
      return new PaginatedResult(await this.withCustomers(page.items), page.limit, page.nextCursor);
    }
    const filtered = (await this.withCustomers(await this.patients.collect(query))).filter((item) =>
      matchesColumnFilters(item, query.filters),
    );
    return paginateInMemory(filtered, query.limit, query.cursor);
  }

  private async withCustomers(patients: Patient[]): Promise<PatientListItem[]> {
    const customers = await this.customers.findByIds(patients.map((item) => item.customerId));
    return patients.map((patient) => {
      const customer = customers.get(patient.customerId);
      return {
        ...patient,
        customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
        customerPhone: customer?.phone ?? '',
        customerEmail: customer?.email ?? null,
      };
    });
  }

  update(id: string, dto: UpdatePatientDto) {
    return this.patients.update(id, dto);
  }

  softDelete(id: string) {
    return this.patients.softDelete(id);
  }

  private async assertCustomer(customerId: string): Promise<void> {
    const customer = await this.customers.findById(customerId);
    if (!customer) {
      throw new AppException(
        ErrorCode.PATIENT_INVALID,
        'customerId does not belong to the current tenant',
      );
    }
  }
}

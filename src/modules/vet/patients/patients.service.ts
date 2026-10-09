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

  async getPedigree(id: string) {
    const patient = await this.patients.getByIdOrThrow(id);
    const father = patient.fatherId ? await this.patients.findById(patient.fatherId) : null;
    const mother = patient.motherId ? await this.patients.findById(patient.motherId) : null;

    let paternalGrandfather = null;
    let paternalGrandmother = null;
    if (father) {
      if (father.fatherId) paternalGrandfather = await this.patients.findById(father.fatherId);
      if (father.motherId) paternalGrandmother = await this.patients.findById(father.motherId);
    }

    let maternalGrandfather = null;
    let maternalGrandmother = null;
    if (mother) {
      if (mother.fatherId) maternalGrandfather = await this.patients.findById(mother.fatherId);
      if (mother.motherId) maternalGrandmother = await this.patients.findById(mother.motherId);
    }

    return {
      patient,
      parents: {
        father: father || (patient.fatherName ? { name: patient.fatherName, pedigreeNo: patient.fatherPedigreeNo } : null),
        mother: mother || (patient.motherName ? { name: patient.motherName, pedigreeNo: patient.motherPedigreeNo } : null),
      },
      grandparents: {
        paternalGrandfather: paternalGrandfather || (patient.paternalGrandfatherName ? { name: patient.paternalGrandfatherName } : null),
        paternalGrandmother: paternalGrandmother || (patient.paternalGrandmotherName ? { name: patient.paternalGrandmotherName } : null),
        maternalGrandfather: maternalGrandfather || (patient.maternalGrandfatherName ? { name: patient.maternalGrandfatherName } : null),
        maternalGrandmother: maternalGrandmother || (patient.maternalGrandmotherName ? { name: patient.maternalGrandmotherName } : null),
      },
    };
  }

  async getOffspring(id: string) {
    const all = await this.patients.collect({});
    const offspring = all.filter((p) => p.motherId === id || p.fatherId === id);
    return this.withCustomers(offspring);
  }

  async getScrCertificate(id: string) {
    const pedigreeData = await this.getPedigree(id);
    return {
      certificateNumber: pedigreeData.patient.pedigreeNo || ('SCR-' + id.toUpperCase()),
      issuedDate: new Date().toISOString(),
      patient: pedigreeData.patient,
      lineage: pedigreeData,
      seal: 'VERIFIED_ODIVON_VET_REGISTRY',
    };
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

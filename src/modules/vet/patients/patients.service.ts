import { Injectable } from '@nestjs/common';
import { CustomersRepository } from '../customers/customers.repository';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
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

  list(query: ListPatientsQueryDto) {
    return this.patients.list(query);
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

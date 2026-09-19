import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { CustomersRepository } from '../customers/customers.repository';
import { PatientsRepository } from '../patients/patients.repository';
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

  list(query: ListExaminationsQueryDto) {
    return this.examinations.list(query);
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
}

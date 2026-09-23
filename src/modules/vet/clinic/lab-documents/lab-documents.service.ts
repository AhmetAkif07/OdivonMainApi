import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { CustomersRepository } from '../../customers/customers.repository';
import { PatientsRepository } from '../../patients/patients.repository';
import { CreateLabDocumentDto, UpdateLabDocumentDto } from './lab-document.dto';
import { LabDocumentsRepository } from './lab-documents.repository';

@Injectable()
export class LabDocumentsService {
  constructor(
    private readonly documents: LabDocumentsRepository,
    private readonly patients: PatientsRepository,
    private readonly customers: CustomersRepository,
  ) {}

  async create(dto: CreateLabDocumentDto) {
    const refs = await this.resolvePatient(dto.patientId);
    return this.documents.create({
      ...refs,
      fileName: dto.fileName.trim(),
      url: dto.url.trim(),
      remark: dto.remark || null,
      read: dto.read ?? false,
    });
  }

  getById(id: string) {
    return this.documents.getByIdOrThrow(id);
  }

  async list(query: PagingQueryDto) {
    const items = (await this.documents.collect()).filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateLabDocumentDto) {
    const refs = dto.patientId ? await this.resolvePatient(dto.patientId) : {};
    return this.documents.update(id, {
      ...refs,
      fileName: dto.fileName?.trim(),
      url: dto.url?.trim(),
      remark: dto.remark,
      read: dto.read,
    });
  }

  softDelete(id: string) {
    return this.documents.softDelete(id);
  }

  private async resolvePatient(patientId: string) {
    const patient = await this.patients.findById(patientId);
    if (!patient) {
      throw new AppException(ErrorCode.PATIENT_NOT_FOUND, 'Hasta bulunamadı');
    }
    const customer = await this.customers.findById(patient.customerId);
    return {
      patientId: patient.id,
      patientName: patient.name,
      customerId: patient.customerId,
      customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
    };
  }
}

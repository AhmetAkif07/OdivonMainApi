import { Injectable } from '@nestjs/common';
import { Query } from 'firebase-admin/firestore';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateQuery } from '../../../shared/firestore/paginate';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreatePatientDto } from './dto/create-patient.dto';
import { ListPatientsQueryDto } from './dto/list-patients.query.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import { Patient } from './entities/patient.entity';

@Injectable()
export class PatientsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.patients),
    );
  }

  toPatient(id: string, dto: Omit<CreatePatientDto, 'customerId'> & { customerId: string }): Patient {
    return {
      ...createBaseFields(id, this.tenantContext.getUserId()),
      customerId: dto.customerId,
      name: dto.name,
      birthDate: dto.birthDate ?? null,
      chipNumber: dto.chipNumber ?? null,
      sex: dto.sex ?? 'unknown',
      animalType: dto.animalType,
      breed: dto.breed ?? null,
      color: dto.color ?? null,
      sterilization: dto.sterilization ?? false,
      notes: dto.notes ?? null,
      active: dto.active ?? true,
    };
  }

  async create(dto: CreatePatientDto): Promise<Patient> {
    const ref = this.collection().doc();
    const patient = this.toPatient(ref.id, dto);
    await ref.set(patient);
    await this.audit.record({
      action: AuditAction.PATIENT_CREATED,
      entity: 'patient',
      entityId: patient.id,
    });
    return patient;
  }

  async createWithId(id: string, dto: CreatePatientDto): Promise<Patient> {
    const patient = this.toPatient(id, dto);
    await this.collection().doc(id).set(patient);
    await this.audit.record({
      action: AuditAction.PATIENT_CREATED,
      entity: 'patient',
      entityId: patient.id,
    });
    return patient;
  }

  async findById(id: string): Promise<Patient | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const patient = snapshot.data() as Patient;
    if (isDeleted(patient)) {
      return null;
    }
    return patient;
  }

  async getByIdOrThrow(id: string): Promise<Patient> {
    const patient = await this.findById(id);
    if (!patient) {
      throw new AppException(ErrorCode.PATIENT_NOT_FOUND, 'Patient not found');
    }
    return patient;
  }

  async list(query: ListPatientsQueryDto) {
    let firestoreQuery: Query = this.collection().where('deletedAt', '==', null);
    if (query.customerId) {
      firestoreQuery = firestoreQuery.where('customerId', '==', query.customerId);
    }
    return paginateQuery<Patient>(firestoreQuery, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const current = await this.getByIdOrThrow(id);
    const updated: Patient = {
      ...current,
      ...dto,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({
      action: AuditAction.PATIENT_UPDATED,
      entity: 'patient',
      entityId: id,
    });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .update({
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
    await this.audit.record({
      action: AuditAction.PATIENT_DELETED,
      entity: 'patient',
      entityId: id,
    });
  }
}

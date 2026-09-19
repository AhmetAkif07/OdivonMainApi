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
  omitUndefined,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { paginateQuery } from '../../../shared/firestore/paginate';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { Appointment } from '../appointments/entities/appointment.entity';
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

  async findByIds(ids: string[]): Promise<Map<string, Patient>> {
    const unique = [...new Set(ids.filter(Boolean))];
    const found = new Map<string, Patient>();
    if (unique.length === 0) {
      return found;
    }
    for (let index = 0; index < unique.length; index += 100) {
      const chunk = unique.slice(index, index + 100);
      const snapshots = await this.firebase.db.getAll(...chunk.map((id) => this.collection().doc(id)));
      for (const snapshot of snapshots) {
        if (!snapshot.exists) {
          continue;
        }
        const patient = snapshot.data() as Patient;
        if (isDeleted(patient)) {
          continue;
        }
        found.set(patient.id, patient);
      }
    }
    return found;
  }

  async list(query: ListPatientsQueryDto) {
    if (query.createdFrom || query.createdTo || query.appointmentFrom || query.appointmentTo) {
      return paginateInMemory(await this.collect(query), query.limit, query.cursor);
    }
    let firestoreQuery: Query = this.collection().where('deletedAt', '==', null);
    if (query.customerId) {
      firestoreQuery = firestoreQuery.where('customerId', '==', query.customerId);
    }
    return paginateQuery<Patient>(firestoreQuery, query.limit, query.cursor);
  }

  async collect(query: ListPatientsQueryDto): Promise<Patient[]> {
    const snapshot = await this.collection().get();
    let items = snapshot.docs
      .map((doc) => doc.data() as Patient)
      .filter((patient) => !isDeleted(patient))
      .filter((patient) => (query.customerId ? patient.customerId === query.customerId : true))
      .filter((patient) => inDateRange(patient.createdAt, query.createdFrom, query.createdTo));

    if (query.appointmentFrom || query.appointmentTo) {
      const patientIds = await this.patientIdsWithAppointments(query.appointmentFrom, query.appointmentTo);
      items = items.filter((patient) => patientIds.has(patient.id));
    }

    return items.sort(
      (left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
    );
  }

  async findByCustomerIds(customerIds: string[]): Promise<Map<string, Patient[]>> {
    const unique = [...new Set(customerIds.filter(Boolean))];
    const grouped = new Map<string, Patient[]>();
    for (const id of unique) {
      grouped.set(id, []);
    }
    if (unique.length === 0) {
      return grouped;
    }
    for (let index = 0; index < unique.length; index += 10) {
      const chunk = unique.slice(index, index + 10);
      const snapshot = await this.collection().where('customerId', 'in', chunk).get();
      for (const doc of snapshot.docs) {
        const patient = doc.data() as Patient;
        if (isDeleted(patient)) {
          continue;
        }
        grouped.get(patient.customerId)?.push(patient);
      }
    }
    for (const patients of grouped.values()) {
      patients.sort((left, right) => left.name.localeCompare(right.name, 'tr'));
    }
    return grouped;
  }

  private async patientIdsWithAppointments(from?: string, to?: string): Promise<Set<string>> {
    const snapshot = await this.firebase.db
      .collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.appointments))
      .get();
    const ids = new Set<string>();
    for (const doc of snapshot.docs) {
      const appointment = doc.data() as Appointment;
      if (isDeleted(appointment) || appointment.status === 'cancelled' || !appointment.patientId) {
        continue;
      }
      if (!inDateRange(appointment.beginAt, from, to)) {
        continue;
      }
      ids.add(appointment.patientId);
    }
    return ids;
  }

  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const current = await this.getByIdOrThrow(id);
    const updated: Patient = {
      ...current,
      ...omitUndefined(dto),
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

function inDateRange(value: string, from?: string, to?: string): boolean {
  if (from && value < from) {
    return false;
  }
  if (to && value > to) {
    return false;
  }
  return true;
}

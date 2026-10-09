import { Injectable } from '@nestjs/common';
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
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateExaminationDto } from './dto/create-examination.dto';
import { ListExaminationsQueryDto } from './dto/list-examinations.query.dto';
import { UpdateExaminationDto } from './dto/update-examination.dto';
import { Examination } from './entities/examination.entity';

@Injectable()
export class ExaminationsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.examinations),
    );
  }

  async create(dto: CreateExaminationDto): Promise<Examination> {
    const ref = this.collection().doc();
    const examination: Examination = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      date: new Date(dto.date).toISOString(),
      customerId: dto.customerId,
      patientId: dto.patientId,
      vitals: {
        temp: dto.vitals?.temp ?? null,
        pulse: dto.vitals?.pulse ?? null,
        respiratoryRate: dto.vitals?.respiratoryRate ?? null,
        weight: dto.vitals?.weight ?? null,
      },
      symptoms: dto.symptoms ?? [],
      complaint: dto.complaint ?? null,
      treatment: dto.treatment ?? null,
      status: dto.status ?? 'draft',
      bundleId: dto.bundleId ?? null,
      bundleName: dto.bundleName ?? null,
      deductStock: dto.deductStock ?? false,
      treatmentItems: dto.treatmentItems ?? null,
    };
    await ref.set(examination);
    await this.audit.record({
      action: AuditAction.EXAMINATION_CREATED,
      entity: 'examination',
      entityId: examination.id,
    });
    return examination;
  }

  async findById(id: string): Promise<Examination | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const examination = snapshot.data() as Examination;
    if (isDeleted(examination)) {
      return null;
    }
    return examination;
  }

  async getByIdOrThrow(id: string): Promise<Examination> {
    const examination = await this.findById(id);
    if (!examination) {
      throw new AppException(ErrorCode.EXAMINATION_NOT_FOUND, 'Examination not found');
    }
    return examination;
  }

  async list(query: ListExaminationsQueryDto) {
    return paginateInMemory(await this.collect(query), query.limit, query.cursor);
  }

  async collect(query: ListExaminationsQueryDto): Promise<Examination[]> {
    const snapshot = await this.collection().get();
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return snapshot.docs
      .map((doc) => doc.data() as Examination)
      .filter((item) => !isDeleted(item))
      .filter((item) => (query.patientId ? item.patientId === query.patientId : true))
      .filter((item) => (query.customerId ? item.customerId === query.customerId : true))
      .filter((item) => inDateWindow(item.date, from, to))
      .sort(compareExaminationsByDateDesc);
  }

  async update(id: string, dto: UpdateExaminationDto): Promise<Examination> {
    const current = await this.getByIdOrThrow(id);
    const updated: Examination = {
      ...current,
      date: dto.date ? new Date(dto.date).toISOString() : current.date,
      vitals: dto.vitals
        ? {
            temp: dto.vitals.temp ?? current.vitals.temp,
            pulse: dto.vitals.pulse ?? current.vitals.pulse,
            respiratoryRate: dto.vitals.respiratoryRate ?? current.vitals.respiratoryRate,
            weight: dto.vitals.weight ?? current.vitals.weight,
          }
        : current.vitals,
      symptoms: dto.symptoms ?? current.symptoms,
      complaint: dto.complaint ?? current.complaint,
      treatment: dto.treatment ?? current.treatment,
      status: dto.status ?? current.status,
      bundleId: dto.bundleId !== undefined ? dto.bundleId : current.bundleId,
      bundleName: dto.bundleName !== undefined ? dto.bundleName : current.bundleName,
      deductStock: dto.deductStock !== undefined ? dto.deductStock : current.deductStock,
      treatmentItems: dto.treatmentItems !== undefined ? dto.treatmentItems : current.treatmentItems,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({
      action: AuditAction.EXAMINATION_UPDATED,
      entity: 'examination',
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
      action: AuditAction.EXAMINATION_DELETED,
      entity: 'examination',
      entityId: id,
    });
  }
}

export function compareExaminationsByDateDesc(left: Examination, right: Examination): number {
  return right.date.localeCompare(left.date) || right.id.localeCompare(left.id);
}

function inDateWindow(value: string, from?: Date, to?: Date): boolean {
  if (!from && !to) {
    return true;
  }
  const date = new Date(value);
  if (from && date < from) {
    return false;
  }
  if (to && date > to) {
    return false;
  }
  return true;
}

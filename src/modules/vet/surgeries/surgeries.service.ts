import { Injectable } from '@nestjs/common';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { isDeleted } from '../../../shared/firestore/base-document';
import { IdentityRepository } from '../../identity/identity.repository';
import { DocStoreConfig, TenantDocStore } from '../shared/tenant-doc-store';
import { CreateSurgeryDto, SurgeryQueryDto, UpdateSurgeryDto } from './surgery.dto';
import { DEFAULT_CHECKLIST, Surgery, SurgeryChecklistItem, SurgeryTimes } from './surgery.entity';

@Injectable()
export class SurgeriesRepository extends TenantDocStore<Surgery> {
  protected readonly config: DocStoreConfig = {
    collection: TENANT_COLLECTION.surgeries,
    entity: 'surgery',
    notFound: ErrorCode.SURGERY_NOT_FOUND,
    notFoundMessage: 'Ameliyat kaydı bulunamadı',
    actions: {
      created: AuditAction.SURGERY_CREATED,
      updated: AuditAction.SURGERY_UPDATED,
      deleted: AuditAction.SURGERY_DELETED,
    },
  };

  async patientWithOwner(patientId: string): Promise<{ patientName: string; customerId: string; customerName: string } | null> {
    const tenantId = this.tenantContext.getTenantId();
    const patientSnap = await this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.patients)).doc(patientId).get();
    const patient = patientSnap.exists ? (patientSnap.data() as { name?: string; customerId?: string; deletedAt?: string | null }) : null;
    if (!patient || isDeleted(patient) || !patient.customerId) return null;
    const customerSnap = await this.firebase.db
      .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.customers))
      .doc(patient.customerId)
      .get();
    const customer = customerSnap.exists ? (customerSnap.data() as { firstName?: string; lastName?: string }) : null;
    return {
      patientName: patient.name ?? '',
      customerId: patient.customerId,
      customerName: customer ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() : '',
    };
  }
}

function minutesOf(time: string | null | undefined): number | null {
  if (!time) return null;
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/** Minutes from start to end; an end before the start means the surgery ran past midnight. */
export function durationMinutes(times: SurgeryTimes): number | null {
  const start = minutesOf(times.surgeryStart);
  const end = minutesOf(times.surgeryEnd);
  if (start === null || end === null) return null;
  return end >= start ? end - start : end + 24 * 60 - start;
}

export function defaultChecklist(): SurgeryChecklistItem[] {
  return DEFAULT_CHECKLIST.map((item) => ({ ...item, done: false }));
}

@Injectable()
export class SurgeriesService {
  constructor(
    private readonly repo: SurgeriesRepository,
    private readonly identity: IdentityRepository,
  ) {}

  checklistTemplate(): SurgeryChecklistItem[] {
    return defaultChecklist();
  }

  async list(query: SurgeryQueryDto): Promise<Surgery[]> {
    const items = query.patientId
      ? await this.repo.whereEquals('patientId', query.patientId)
      : query.from
        ? await this.repo.since('date', query.from)
        : await this.repo.collect();
    return items
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.from || item.date >= query.from)
      .filter((item) => !query.to || item.date <= query.to)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.times.surgeryStart ?? '').localeCompare(a.times.surgeryStart ?? ''));
  }

  get(id: string): Promise<Surgery> {
    return this.repo.getByIdOrThrow(id);
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    const users = await this.identity.listByCurrentTenant();
    return new Map(users.map((user) => [user.uid, user.displayName || user.email]));
  }

  private checkCompletion(item: Pick<Surgery, 'status' | 'times'>): void {
    if (item.status === 'completed' && (!item.times.surgeryStart || !item.times.surgeryEnd)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Tamamlanan ameliyat için başlangıç ve bitiş saatini girin');
    }
  }

  async create(dto: CreateSurgeryDto): Promise<Surgery> {
    const owner = await this.repo.patientWithOwner(dto.patientId);
    if (!owner) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Hasta bulunamadı');
    }
    const assistantIds = [...new Set(dto.assistantIds ?? [])];
    const names = await this.names([dto.surgeonId ?? '', ...assistantIds].filter(Boolean));
    const times: SurgeryTimes = {
      anesthesiaStart: dto.times?.anesthesiaStart ?? null,
      surgeryStart: dto.times?.surgeryStart ?? null,
      surgeryEnd: dto.times?.surgeryEnd ?? null,
      recoveryEnd: dto.times?.recoveryEnd ?? null,
    };
    const fields = {
      date: dto.date,
      patientId: dto.patientId,
      ...owner,
      examinationId: dto.examinationId || null,
      type: dto.type.trim(),
      description: dto.description?.trim() || null,
      surgeonId: dto.surgeonId || null,
      surgeonName: dto.surgeonId ? names.get(dto.surgeonId) ?? null : null,
      assistantIds,
      assistantNames: assistantIds.map((id) => names.get(id) ?? ''),
      anesthesia: {
        asaClass: dto.anesthesia?.asaClass ?? null,
        emergency: dto.anesthesia?.emergency ?? false,
        protocol: dto.anesthesia?.protocol?.trim() || null,
        agents: dto.anesthesia?.agents?.trim() || null,
        monitoring: dto.anesthesia?.monitoring?.trim() || null,
      },
      times,
      durationMinutes: durationMinutes(times),
      checklist: dto.checklist?.length ? dto.checklist : defaultChecklist(),
      complications: dto.complications?.trim() || null,
      postOpNotes: dto.postOpNotes?.trim() || null,
      status: dto.status ?? 'planned',
    };
    this.checkCompletion(fields);
    return this.repo.create(fields);
  }

  async update(id: string, dto: UpdateSurgeryDto): Promise<Surgery> {
    const current = await this.repo.getByIdOrThrow(id);
    const next: Surgery = { ...current };
    if (dto.patientId && dto.patientId !== current.patientId) {
      const owner = await this.repo.patientWithOwner(dto.patientId);
      if (!owner) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Hasta bulunamadı');
      Object.assign(next, { patientId: dto.patientId, ...owner });
    }
    if (dto.date !== undefined) next.date = dto.date;
    if (dto.examinationId !== undefined) next.examinationId = dto.examinationId || null;
    if (dto.type !== undefined) next.type = dto.type.trim();
    if (dto.description !== undefined) next.description = dto.description?.trim() || null;
    if (dto.complications !== undefined) next.complications = dto.complications?.trim() || null;
    if (dto.postOpNotes !== undefined) next.postOpNotes = dto.postOpNotes?.trim() || null;
    if (dto.status !== undefined) next.status = dto.status;
    if (dto.checklist !== undefined) next.checklist = dto.checklist;
    if (dto.anesthesia) {
      next.anesthesia = {
        ...current.anesthesia,
        ...Object.fromEntries(Object.entries(dto.anesthesia).filter(([, value]) => value !== undefined)),
      };
    }
    if (dto.times) {
      next.times = { ...current.times, ...Object.fromEntries(Object.entries(dto.times).filter(([, value]) => value !== undefined)) };
      next.durationMinutes = durationMinutes(next.times);
    }
    if (dto.surgeonId !== undefined || dto.assistantIds !== undefined) {
      const surgeonId = dto.surgeonId === undefined ? current.surgeonId : dto.surgeonId || null;
      const assistantIds = dto.assistantIds === undefined ? current.assistantIds : [...new Set(dto.assistantIds)];
      const names = await this.names([surgeonId ?? '', ...assistantIds].filter(Boolean));
      next.surgeonId = surgeonId;
      next.surgeonName = surgeonId ? names.get(surgeonId) ?? null : null;
      next.assistantIds = assistantIds;
      next.assistantNames = assistantIds.map((assistant) => names.get(assistant) ?? '');
    }
    this.checkCompletion(next);
    return this.repo.save(next);
  }

  async remove(id: string): Promise<void> {
    await this.repo.softDelete(await this.repo.getByIdOrThrow(id));
  }
}

import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateAgendaDto, UpdateAgendaDto } from './agenda.dto';
import { AgendaItem } from './agenda.entity';

@Injectable()
export class AgendaRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.agenda));
  }

  async create(dto: CreateAgendaDto): Promise<AgendaItem> {
    const ref = this.collection().doc();
    const item: AgendaItem = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      title: dto.title.trim(),
      type: dto.type,
      priority: dto.priority,
      dueAt: dto.dueAt,
      notes: dto.notes || null,
      done: dto.done ?? false,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.AGENDA_CREATED, entity: 'agenda', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<AgendaItem | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as AgendaItem;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<AgendaItem> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.AGENDA_NOT_FOUND, 'Ajanda kaydı bulunamadı');
    }
    return item;
  }

  async collect(): Promise<AgendaItem[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as AgendaItem)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.id.localeCompare(right.id));
  }

  async update(id: string, dto: UpdateAgendaDto): Promise<AgendaItem> {
    const current = await this.getByIdOrThrow(id);
    const updated: AgendaItem = {
      ...current,
      ...omitUndefined({
        title: dto.title?.trim(),
        type: dto.type,
        priority: dto.priority,
        dueAt: dto.dueAt,
        notes: dto.notes,
        done: dto.done,
      }),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.AGENDA_UPDATED, entity: 'agenda', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.AGENDA_DELETED, entity: 'agenda', entityId: id });
  }
}

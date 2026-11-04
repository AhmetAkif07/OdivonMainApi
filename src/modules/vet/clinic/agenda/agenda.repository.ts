import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import {
  BaseDocument,
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateAgendaDto, UpdateAgendaDto } from './agenda.dto';
import { AgendaItem } from './agenda.entity';

/** Firestore allows 500 writes per batch. */
const BATCH_SIZE = 400;

export type AgendaFields = Omit<AgendaItem, keyof BaseDocument>;

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

  newId(): string {
    return this.collection().doc().id;
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
      seriesId: null,
      occurrenceIndex: null,
      recurrence: null,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.AGENDA_CREATED, entity: 'agenda', entityId: item.id });
    return item;
  }

  /** Creates several items; `ids[i]` (when given) is used as the id of `fields[i]`. */
  async createMany(fields: AgendaFields[], ids: string[] = []): Promise<AgendaItem[]> {
    const userId = this.tenantContext.getUserId();
    const items = fields.map((item, index) => {
      const ref = ids[index] ? this.collection().doc(ids[index]) : this.collection().doc();
      return { ...createBaseFields(ref.id, userId), ...item } as AgendaItem;
    });
    await this.writeAll(items);
    if (items.length) {
      await this.audit.record({
        action: AuditAction.AGENDA_CREATED,
        entity: 'agenda',
        entityId: items[0].id,
        changes: { occurrences: items.length, seriesId: items[0].seriesId ?? null },
      });
    }
    return items;
  }

  /** Saves already-modified items (base fields are touched here). */
  async saveMany(items: AgendaItem[], action: 'updated' | 'deleted' = 'updated'): Promise<AgendaItem[]> {
    const userId = this.tenantContext.getUserId();
    const saved = items.map((item) => ({ ...item, ...touchBaseFields(userId) }));
    await this.writeAll(saved);
    if (saved.length) {
      await this.audit.record({
        action: action === 'deleted' ? AuditAction.AGENDA_DELETED : AuditAction.AGENDA_UPDATED,
        entity: 'agenda',
        entityId: saved[0].id,
        changes: { items: saved.length, seriesId: saved[0].seriesId ?? null },
      });
    }
    return saved;
  }

  private async writeAll(items: AgendaItem[]): Promise<void> {
    for (let start = 0; start < items.length; start += BATCH_SIZE) {
      const batch = this.firebase.db.batch();
      for (const item of items.slice(start, start + BATCH_SIZE)) {
        batch.set(this.collection().doc(item.id), item);
      }
      await batch.commit();
    }
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

  /** Items of a series by occurrence order; deleted ones only when asked (to find the last index). */
  async seriesItems(seriesId: string, includeDeleted = false): Promise<AgendaItem[]> {
    const snapshot = await this.collection().where('seriesId', '==', seriesId).get();
    return snapshot.docs
      .map((doc) => doc.data() as AgendaItem)
      .filter((item) => includeDeleted || !isDeleted(item))
      .sort((left, right) => (left.occurrenceIndex ?? 0) - (right.occurrenceIndex ?? 0));
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

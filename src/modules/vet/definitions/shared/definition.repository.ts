import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import {
  BaseDocument,
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';

export interface DefinitionDocument extends BaseDocument {
  name: string;
}

export interface DefinitionRepositoryConfig {
  collection: string;
  entity: string;
  notFound: ErrorCode;
  notFoundMessage: string;
  actions: { created: AuditAction; updated: AuditAction; deleted: AuditAction };
}

export type DefinitionFields<T extends DefinitionDocument> = Omit<T, keyof BaseDocument>;

export abstract class DefinitionRepository<
  T extends DefinitionDocument,
  C extends object,
  U extends object,
> {
  protected abstract readonly config: DefinitionRepositoryConfig;

  constructor(
    protected readonly firebase: FirebaseService,
    protected readonly tenantContext: TenantContext,
    protected readonly audit: AuditService,
  ) {}

  protected abstract toFields(dto: C): DefinitionFields<T>;

  protected collection(name = this.config.collection) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), name));
  }

  async create(dto: C): Promise<T> {
    const ref = this.collection().doc();
    const item = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...this.toFields(dto),
    } as T;
    await ref.set(item);
    await this.audit.record({
      action: this.config.actions.created,
      entity: this.config.entity,
      entityId: item.id,
    });
    return item;
  }

  async findById(id: string): Promise<T | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as T;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<T> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(this.config.notFound, this.config.notFoundMessage);
    }
    return item;
  }

  async findByIds(ids: Array<string | null | undefined>): Promise<Map<string, T>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    const found = new Map<string, T>();
    for (let index = 0; index < unique.length; index += 100) {
      const chunk = unique.slice(index, index + 100);
      const snapshots = await this.firebase.db.getAll(...chunk.map((id) => this.collection().doc(id)));
      for (const snapshot of snapshots) {
        if (!snapshot.exists) {
          continue;
        }
        const item = snapshot.data() as T;
        if (!isDeleted(item)) {
          found.set(item.id, item);
        }
      }
    }
    return found;
  }

  async collect(): Promise<T[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as T)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => left.name.localeCompare(right.name, 'tr') || left.id.localeCompare(right.id));
  }

  async update(id: string, dto: U): Promise<T> {
    const current = await this.getByIdOrThrow(id);
    const updated = {
      ...current,
      ...omitUndefined(dto),
      ...touchBaseFields(this.tenantContext.getUserId()),
    } as T;
    await this.collection().doc(id).set(updated);
    await this.audit.record({
      action: this.config.actions.updated,
      entity: this.config.entity,
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
      action: this.config.actions.deleted,
      entity: this.config.entity,
      entityId: id,
    });
  }

  async isReferenced(collection: string, field: string, id: string): Promise<boolean> {
    const snapshot = await this.collection(collection)
      .where(field, '==', id)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();
    return !snapshot.empty;
  }
}

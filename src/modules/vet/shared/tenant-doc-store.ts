import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';

export interface DocStoreConfig {
  collection: string;
  entity: string;
  notFound: ErrorCode;
  notFoundMessage: string;
  actions: { created: AuditAction; updated: AuditAction; deleted: AuditAction };
}

/**
 * Small tenant-scoped document store with soft delete and audit records.
 * @Injectable() here makes TypeScript emit the constructor parameter types; subclasses without
 * their own constructor inherit them, otherwise Nest would inject nothing.
 */
@Injectable()
export abstract class TenantDocStore<T extends BaseDocument> {
  protected abstract readonly config: DocStoreConfig;

  constructor(
    protected readonly firebase: FirebaseService,
    protected readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  protected collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), this.config.collection));
  }

  async create(fields: Omit<T, keyof BaseDocument>): Promise<T> {
    const ref = this.collection().doc();
    const item = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...fields } as T;
    await ref.set(item);
    await this.audit.record({ action: this.config.actions.created, entity: this.config.entity, entityId: item.id });
    return item;
  }

  async save(item: T): Promise<T> {
    const updated = { ...item, ...touchBaseFields(this.tenantContext.getUserId()) };
    await this.collection().doc(item.id).set(updated);
    await this.audit.record({ action: this.config.actions.updated, entity: this.config.entity, entityId: item.id });
    return updated;
  }

  /** Saves without an audit record (for frequent, low-value writes such as read receipts). */
  async saveQuietly(item: T): Promise<T> {
    await this.collection().doc(item.id).set(item);
    return item;
  }

  async getByIdOrThrow(id: string): Promise<T> {
    const snapshot = await this.collection().doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as T) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(this.config.notFound, this.config.notFoundMessage);
    }
    return item;
  }

  async collect(): Promise<T[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((doc) => doc.data() as T).filter((item) => !isDeleted(item));
  }

  /** Items whose `field` is >= `from` (single-field range; no composite index needed). */
  async since(field: string, from: string): Promise<T[]> {
    const snapshot = await this.collection().where(field, '>=', from).get();
    return snapshot.docs.map((doc) => doc.data() as T).filter((item) => !isDeleted(item));
  }

  async whereEquals(field: string, value: string): Promise<T[]> {
    const snapshot = await this.collection().where(field, '==', value).get();
    return snapshot.docs.map((doc) => doc.data() as T).filter((item) => !isDeleted(item));
  }

  async softDelete(item: T): Promise<void> {
    await this.collection()
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: this.config.actions.deleted, entity: this.config.entity, entityId: item.id });
  }
}

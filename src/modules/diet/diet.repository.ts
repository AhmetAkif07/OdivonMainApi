import { Injectable } from '@nestjs/common';
import { AuditService } from '../../shared/audit/audit.service';
import { AuditAction } from '../../shared/audit/audit.types';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../shared/firestore/base-document';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { DietCollection } from './diet.constants';

const NOT_FOUND: Record<string, string> = {
  dietClients: 'Danışan bulunamadı.',
  dietMeasurements: 'Ölçüm bulunamadı.',
  dietConsultations: 'Görüşme bulunamadı.',
  dietPlans: 'Beslenme planı bulunamadı.',
  dietTasks: 'Görev bulunamadı.',
  dietRequests: 'Talep bulunamadı.',
};

/**
 * Tenant-scoped access to the `diet*` collections. The tenant id always comes from the verified
 * user (TenantContext), never from the request. Deletes are soft (`deletedAt`) and audited.
 */
@Injectable()
export class DietRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
    private readonly audit: AuditService,
  ) {}

  userId(): string {
    return this.tenant.getUserId();
  }

  collection(name: DietCollection) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), name));
  }

  async all<T extends BaseDocument>(name: DietCollection): Promise<T[]> {
    const snapshot = await this.collection(name).get();
    return snapshot.docs.map((doc) => doc.data() as T).filter((item) => !isDeleted(item));
  }

  async where<T extends BaseDocument>(name: DietCollection, field: string, value: string): Promise<T[]> {
    const snapshot = await this.collection(name).where(field, '==', value).get();
    return snapshot.docs.map((doc) => doc.data() as T).filter((item) => !isDeleted(item));
  }

  async since<T extends BaseDocument>(name: DietCollection, field: string, from: string): Promise<T[]> {
    const snapshot = await this.collection(name).where(field, '>=', from).get();
    return snapshot.docs.map((doc) => doc.data() as T).filter((item) => !isDeleted(item));
  }

  async find<T extends BaseDocument>(name: DietCollection, id: string): Promise<T | null> {
    const snapshot = await this.collection(name).doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as T) : null;
    return item && !isDeleted(item) ? item : null;
  }

  async get<T extends BaseDocument>(name: DietCollection, id: string): Promise<T> {
    const item = await this.find<T>(name, id);
    if (!item) throw new AppException(ErrorCode.DIET_RECORD_NOT_FOUND, NOT_FOUND[name] ?? 'Kayıt bulunamadı.');
    return item;
  }

  async create<T extends BaseDocument>(
    name: DietCollection,
    fields: Omit<T, keyof BaseDocument>,
    options: { id?: string; audit?: boolean } = {},
  ): Promise<T> {
    const ref = options.id ? this.collection(name).doc(options.id) : this.collection(name).doc();
    const item = { ...createBaseFields(ref.id, this.userId()), ...fields } as T;
    await ref.set(item);
    if (options.audit !== false) await this.record(AuditAction.DIET_RECORD_CREATED, name, item.id);
    return item;
  }

  async save<T extends BaseDocument>(name: DietCollection, item: T, options: { audit?: boolean } = {}): Promise<T> {
    const updated = { ...item, ...touchBaseFields(this.userId()) };
    await this.collection(name).doc(item.id).set(updated);
    if (options.audit !== false) await this.record(AuditAction.DIET_RECORD_UPDATED, name, item.id);
    return updated;
  }

  async softDelete<T extends BaseDocument>(name: DietCollection, item: T): Promise<void> {
    await this.collection(name)
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.userId()) });
    await this.record(AuditAction.DIET_RECORD_DELETED, name, item.id);
  }

  /** Raw document (no base fields), e.g. per-user settings. */
  async readRaw<T>(name: DietCollection, id: string): Promise<T | null> {
    const snapshot = await this.collection(name).doc(id).get();
    return snapshot.exists ? (snapshot.data() as T) : null;
  }

  async writeRaw(name: DietCollection, id: string, data: Record<string, unknown>): Promise<void> {
    await this.collection(name).doc(id).set(data);
  }

  async deleteRaw(name: DietCollection, id: string): Promise<void> {
    await this.collection(name).doc(id).delete();
  }

  private record(action: AuditAction, entity: string, entityId: string) {
    return this.audit.record({ action, entity, entityId });
  }
}

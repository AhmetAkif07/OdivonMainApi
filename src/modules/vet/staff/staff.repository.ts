import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { StaffLeave, StaffShift } from './staff.entity';

interface StoreConfig {
  collection: string;
  entity: string;
  notFound: ErrorCode;
  notFoundMessage: string;
  actions: { created: AuditAction; updated: AuditAction; deleted: AuditAction };
}

/** Small tenant-scoped document store shared by shifts and leaves. */
abstract class StaffStore<T extends BaseDocument> {
  protected abstract readonly config: StoreConfig;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
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

  async softDelete(item: T): Promise<void> {
    await this.collection()
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: this.config.actions.deleted, entity: this.config.entity, entityId: item.id });
  }
}

@Injectable()
export class StaffShiftsRepository extends StaffStore<StaffShift> {
  protected readonly config: StoreConfig = {
    collection: TENANT_COLLECTION.staffShifts,
    entity: 'staffShift',
    notFound: ErrorCode.STAFF_SHIFT_NOT_FOUND,
    notFoundMessage: 'Vardiya bulunamadı',
    actions: {
      created: AuditAction.STAFF_SHIFT_CREATED,
      updated: AuditAction.STAFF_SHIFT_UPDATED,
      deleted: AuditAction.STAFF_SHIFT_DELETED,
    },
  };
}

@Injectable()
export class StaffLeavesRepository extends StaffStore<StaffLeave> {
  protected readonly config: StoreConfig = {
    collection: TENANT_COLLECTION.staffLeaves,
    entity: 'staffLeave',
    notFound: ErrorCode.STAFF_LEAVE_NOT_FOUND,
    notFoundMessage: 'İzin kaydı bulunamadı',
    actions: {
      created: AuditAction.STAFF_LEAVE_CREATED,
      updated: AuditAction.STAFF_LEAVE_UPDATED,
      deleted: AuditAction.STAFF_LEAVE_DELETED,
    },
  };
}

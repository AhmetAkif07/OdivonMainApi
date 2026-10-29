import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { StockCount } from './stock-count.entity';

type StockCountFields = Omit<StockCount, keyof ReturnType<typeof createBaseFields>>;

@Injectable()
export class StockCountsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.stockCounts),
    );
  }

  async create(fields: StockCountFields): Promise<StockCount> {
    const ref = this.collection().doc();
    const item: StockCount = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...fields };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.STOCK_COUNT_CREATED, entity: 'stockCount', entityId: item.id });
    return item;
  }

  async save(item: StockCount, action: 'updated' | 'applied'): Promise<StockCount> {
    const updated: StockCount = { ...item, ...touchBaseFields(this.tenantContext.getUserId()) };
    await this.collection().doc(item.id).set(updated);
    await this.audit.record({
      action: action === 'applied' ? AuditAction.STOCK_COUNT_APPLIED : AuditAction.STOCK_COUNT_UPDATED,
      entity: 'stockCount',
      entityId: item.id,
    });
    return updated;
  }

  async findById(id: string): Promise<StockCount | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as StockCount;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<StockCount> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.STOCK_COUNT_NOT_FOUND, 'Stok sayımı bulunamadı');
    }
    return item;
  }

  async collect(): Promise<StockCount[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as StockCount)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async softDelete(item: StockCount): Promise<void> {
    await this.collection()
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.STOCK_COUNT_DELETED, entity: 'stockCount', entityId: item.id });
  }
}

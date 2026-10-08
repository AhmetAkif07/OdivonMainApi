import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateStockMovementDto, UpdateStockMovementDto } from './stock-movement.dto';
import { StockMovement } from './stock-movement.entity';

@Injectable()
export class StockMovementsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.stockMovements),
    );
  }

  async create(dto: CreateStockMovementDto, source?: StockMovement['source']): Promise<StockMovement> {
    const ref = this.collection().doc();
    const item: StockMovement = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      date: dto.date,
      productId: dto.productId,
      storeId: dto.storeId,
      direction: dto.direction,
      reason: dto.reason,
      quantity: dto.quantity,
      unitPrice: dto.unitPrice ?? null,
      remark: dto.remark || null,
      batchNo: dto.batchNo ?? null,
      expirationDate: dto.expirationDate ?? null,
      source: source ?? { type: 'manual', id: ref.id },
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.STOCK_MOVEMENT_CREATED, entity: 'stockMovement', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<StockMovement | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as StockMovement;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<StockMovement> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.STOCK_MOVEMENT_NOT_FOUND, 'Stok hareketi bulunamadı');
    }
    return item;
  }

  async findBySource(type: StockMovement['source']['type'], id: string): Promise<StockMovement[]> {
    return (await this.collect()).filter((item) => item.source?.type === type && item.source.id === id);
  }

  async collect(): Promise<StockMovement[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as StockMovement)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async update(id: string, dto: UpdateStockMovementDto): Promise<StockMovement> {
    const current = await this.getByIdOrThrow(id);
    const updated: StockMovement = {
      ...current,
      ...omitUndefined(dto),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.STOCK_MOVEMENT_UPDATED, entity: 'stockMovement', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.STOCK_MOVEMENT_DELETED, entity: 'stockMovement', entityId: id });
  }
}

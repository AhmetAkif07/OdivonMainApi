import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateCollectionDto, UpdateCollectionDto } from './collection.dto';
import { Collection } from './collection.entity';

@Injectable()
export class CollectionsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.collections),
    );
  }

  async create(dto: CreateCollectionDto): Promise<Collection> {
    const ref = this.collection().doc();
    const item: Collection = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      kind: dto.kind,
      date: dto.date,
      customerId: dto.customerId || null,
      supplierId: dto.supplierId || null,
      amount: dto.amount,
      paymentMethodId: dto.paymentMethodId || null,
      cashRegisterId: dto.cashRegisterId || null,
      saleId: dto.saleId || null,
      remark: dto.remark || null,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.COLLECTION_CREATED, entity: 'collection', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<Collection | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as Collection;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<Collection> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.COLLECTION_NOT_FOUND, 'Tahsilat kaydı bulunamadı');
    }
    return item;
  }

  async collect(): Promise<Collection[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Collection)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async update(id: string, dto: UpdateCollectionDto): Promise<Collection> {
    const current = await this.getByIdOrThrow(id);
    const updated: Collection = {
      ...current,
      ...omitUndefined(dto),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.COLLECTION_UPDATED, entity: 'collection', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.COLLECTION_DELETED, entity: 'collection', entityId: id });
  }
}

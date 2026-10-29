import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { Cheque } from './cheque.entity';

@Injectable()
export class ChequesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.cheques));
  }

  async create(fields: Omit<Cheque, keyof BaseDocument>): Promise<Cheque> {
    const ref = this.collection().doc();
    const item: Cheque = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...fields };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.CHEQUE_CREATED, entity: 'cheque', entityId: item.id });
    return item;
  }

  async save(item: Cheque): Promise<Cheque> {
    const updated = { ...item, ...touchBaseFields(this.tenantContext.getUserId()) };
    await this.collection().doc(item.id).set(updated);
    await this.audit.record({ action: AuditAction.CHEQUE_UPDATED, entity: 'cheque', entityId: item.id });
    return updated;
  }

  async getByIdOrThrow(id: string): Promise<Cheque> {
    const snapshot = await this.collection().doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as Cheque) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(ErrorCode.CHEQUE_NOT_FOUND, 'Çek / senet bulunamadı');
    }
    return item;
  }

  async collect(): Promise<Cheque[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Cheque)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate) || left.id.localeCompare(right.id));
  }

  async softDelete(item: Cheque): Promise<void> {
    await this.collection()
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.CHEQUE_DELETED, entity: 'cheque', entityId: item.id });
  }
}

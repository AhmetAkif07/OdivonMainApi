import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { Proforma } from './proforma.entity';

type ProformaAction = 'created' | 'updated' | 'converted';
const ACTIONS: Record<ProformaAction, AuditAction> = {
  created: AuditAction.PROFORMA_CREATED,
  updated: AuditAction.PROFORMA_UPDATED,
  converted: AuditAction.PROFORMA_CONVERTED,
};

@Injectable()
export class ProformasRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.proformas),
    );
  }

  async create(fields: Omit<Proforma, keyof BaseDocument>): Promise<Proforma> {
    const ref = this.collection().doc();
    const item: Proforma = { ...createBaseFields(ref.id, this.tenantContext.getUserId()), ...fields };
    await ref.set(item);
    await this.audit.record({ action: ACTIONS.created, entity: 'proforma', entityId: item.id });
    return item;
  }

  async save(item: Proforma, action: Exclude<ProformaAction, 'created'> = 'updated'): Promise<Proforma> {
    const updated = { ...item, ...touchBaseFields(this.tenantContext.getUserId()) };
    await this.collection().doc(item.id).set(updated);
    await this.audit.record({ action: ACTIONS[action], entity: 'proforma', entityId: item.id });
    return updated;
  }

  async getByIdOrThrow(id: string): Promise<Proforma> {
    const snapshot = await this.collection().doc(id).get();
    const item = snapshot.exists ? (snapshot.data() as Proforma) : null;
    if (!item || isDeleted(item)) {
      throw new AppException(ErrorCode.PROFORMA_NOT_FOUND, 'Proforma bulunamadı');
    }
    return item;
  }

  async collect(): Promise<Proforma[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Proforma)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async softDelete(item: Proforma): Promise<void> {
    await this.collection()
      .doc(item.id)
      .set({ ...item, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.PROFORMA_DELETED, entity: 'proforma', entityId: item.id });
  }
}

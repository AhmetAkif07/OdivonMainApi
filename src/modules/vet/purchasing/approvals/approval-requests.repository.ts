import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { ApprovalRequest, ApprovalTargetType } from './approval-request.entity';

@Injectable()
export class ApprovalRequestsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.approvalRequests),
    );
  }

  async create(data: Omit<ApprovalRequest, keyof import('../../../../shared/firestore/base-document').BaseDocument>): Promise<ApprovalRequest> {
    const ref = this.collection().doc();
    const item: ApprovalRequest = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      ...data,
    };
    await ref.set(item);
    await this.audit.record({
      action: AuditAction.APPROVAL_REQUEST_CREATED,
      entity: 'approvalRequest',
      entityId: item.id,
    });
    return item;
  }

  async findById(id: string): Promise<ApprovalRequest | null> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return null;
    const item = snap.data() as ApprovalRequest;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<ApprovalRequest> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Onay kaydı bulunamadı');
    }
    return item;
  }

  async findByTarget(targetType: ApprovalTargetType, targetId: string): Promise<ApprovalRequest | null> {
    const snap = await this.collection()
      .where('targetType', '==', targetType)
      .where('targetId', '==', targetId)
      .where('deletedAt', '==', null)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as ApprovalRequest;
  }

  async collect(): Promise<ApprovalRequest[]> {
    const snap = await this.collection().get();
    return snap.docs
      .map((d) => d.data() as ApprovalRequest)
      .filter((r) => !isDeleted(r))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }

  async update(id: string, updated: ApprovalRequest): Promise<ApprovalRequest> {
    const toSave: ApprovalRequest = {
      ...updated,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(toSave);
    await this.audit.record({
      action: AuditAction.APPROVAL_REQUEST_DECIDED,
      entity: 'approvalRequest',
      entityId: id,
    });
    return toSave;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({
        ...current,
        deletedAt: new Date().toISOString(),
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
  }
}

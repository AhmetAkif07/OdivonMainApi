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
  omitUndefined,
  touchBaseFields,
} from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateApprovalWorkflowDto, UpdateApprovalWorkflowDto } from './approval-workflow.dto';
import { ApprovalWorkflow } from './approval-workflow.entity';

@Injectable()
export class ApprovalWorkflowsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.approvalWorkflows),
    );
  }

  async create(dto: CreateApprovalWorkflowDto): Promise<ApprovalWorkflow> {
    const ref = this.collection().doc();
    const item: ApprovalWorkflow = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      name: dto.name,
      description: dto.description || null,
      targetType: dto.targetType || 'all',
      minAmount: dto.minAmount ?? 0,
      maxAmount: dto.maxAmount ?? null,
      branchId: dto.branchId || null,
      active: dto.active ?? true,
      autoApproveBelow: dto.autoApproveBelow ?? null,
      steps: dto.steps.map((s, idx) => ({
        stepOrder: s.stepOrder || idx + 1,
        title: s.title,
        approverType: s.approverType,
        approverRole: s.approverRole || null,
        approverUserId: s.approverUserId || null,
        approverName: s.approverName,
        approvalPolicy: s.approvalPolicy || 'single',
        timeoutHours: s.timeoutHours || null,
      })),
    };
    await ref.set(item);
    await this.audit.record({
      action: AuditAction.APPROVAL_WORKFLOW_CREATED,
      entity: 'approvalWorkflow',
      entityId: item.id,
    });
    return item;
  }

  async findById(id: string): Promise<ApprovalWorkflow | null> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return null;
    const item = snap.data() as ApprovalWorkflow;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<ApprovalWorkflow> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Onay senaryosu bulunamadı');
    }
    return item;
  }

  async collect(): Promise<ApprovalWorkflow[]> {
    const snap = await this.collection().get();
    return snap.docs
      .map((d) => d.data() as ApprovalWorkflow)
      .filter((w) => !isDeleted(w))
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  async update(id: string, dto: UpdateApprovalWorkflowDto): Promise<ApprovalWorkflow> {
    const current = await this.getByIdOrThrow(id);
    const updated: ApprovalWorkflow = {
      ...current,
      ...omitUndefined({
        name: dto.name,
        description: dto.description,
        targetType: dto.targetType,
        minAmount: dto.minAmount,
        maxAmount: dto.maxAmount,
        branchId: dto.branchId,
        active: dto.active,
        autoApproveBelow: dto.autoApproveBelow,
        steps: dto.steps
          ? dto.steps.map((s, idx) => ({
              stepOrder: s.stepOrder || idx + 1,
              title: s.title,
              approverType: s.approverType,
              approverRole: s.approverRole || null,
              approverUserId: s.approverUserId || null,
              approverName: s.approverName,
              approvalPolicy: s.approvalPolicy || 'single',
              timeoutHours: s.timeoutHours || null,
            }))
          : current.steps,
      }),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({
      action: AuditAction.APPROVAL_WORKFLOW_UPDATED,
      entity: 'approvalWorkflow',
      entityId: id,
    });
    return updated;
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
    await this.audit.record({
      action: AuditAction.APPROVAL_WORKFLOW_DELETED,
      entity: 'approvalWorkflow',
      entityId: id,
    });
  }
}

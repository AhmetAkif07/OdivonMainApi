import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CashSession, CashSessionSummary } from './cash-session.entity';

@Injectable()
export class CashSessionsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.cashSessions),
    );
  }

  async open(input: { cashRegisterId: string; openingAmount: number; remark: string | null }): Promise<CashSession> {
    const ref = this.collection().doc();
    const userId = this.tenantContext.getUserId();
    const base = createBaseFields(ref.id, userId);
    const item: CashSession = {
      ...base,
      cashRegisterId: input.cashRegisterId,
      status: 'open',
      openedAt: base.createdAt,
      openedBy: userId,
      openingAmount: input.openingAmount,
      openingRemark: input.remark,
      closedAt: null,
      closedBy: null,
      countedAmount: null,
      difference: null,
      closingRemark: null,
      summary: null,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.CASH_SESSION_OPENED, entity: 'cashSession', entityId: item.id });
    return item;
  }

  async close(
    current: CashSession,
    input: { countedAmount: number; remark: string | null; summary: CashSessionSummary; closedAt: string },
  ): Promise<CashSession> {
    const userId = this.tenantContext.getUserId();
    const updated: CashSession = {
      ...current,
      status: 'closed',
      closedAt: input.closedAt,
      closedBy: userId,
      countedAmount: input.countedAmount,
      difference: round2(input.countedAmount - input.summary.expectedAmount),
      closingRemark: input.remark,
      summary: input.summary,
      ...touchBaseFields(userId),
    };
    await this.collection().doc(current.id).set(updated);
    await this.audit.record({ action: AuditAction.CASH_SESSION_CLOSED, entity: 'cashSession', entityId: current.id });
    return updated;
  }

  async findById(id: string): Promise<CashSession | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as CashSession;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<CashSession> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.CASH_SESSION_NOT_FOUND, 'Kasa oturumu bulunamadı');
    }
    return item;
  }

  async collect(): Promise<CashSession[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as CashSession)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.openedAt.localeCompare(left.openedAt) || right.id.localeCompare(left.id));
  }

  async findOpen(cashRegisterId: string): Promise<CashSession | null> {
    return (await this.collect()).find((item) => item.cashRegisterId === cashRegisterId && item.status === 'open') ?? null;
  }
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

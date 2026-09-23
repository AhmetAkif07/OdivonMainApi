import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateCashMovementDto, UpdateCashMovementDto } from './cash-movement.dto';
import { CashMovement } from './cash-movement.entity';

@Injectable()
export class CashMovementsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.cashMovements),
    );
  }

  async create(dto: CreateCashMovementDto): Promise<CashMovement> {
    const ref = this.collection().doc();
    const item: CashMovement = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      cashRegisterId: dto.cashRegisterId,
      date: dto.date,
      direction: dto.direction,
      amount: dto.amount,
      remark: dto.remark || null,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.CASH_MOVEMENT_CREATED, entity: 'cashMovement', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<CashMovement | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as CashMovement;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<CashMovement> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.CASH_MOVEMENT_NOT_FOUND, 'Kasa hareketi bulunamadı');
    }
    return item;
  }

  async collect(): Promise<CashMovement[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as CashMovement)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async update(id: string, dto: UpdateCashMovementDto): Promise<CashMovement> {
    const current = await this.getByIdOrThrow(id);
    const updated: CashMovement = {
      ...current,
      ...omitUndefined(dto),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.CASH_MOVEMENT_UPDATED, entity: 'cashMovement', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.CASH_MOVEMENT_DELETED, entity: 'cashMovement', entityId: id });
  }
}

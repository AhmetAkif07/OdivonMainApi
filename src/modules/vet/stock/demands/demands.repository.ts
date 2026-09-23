import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateDemandDto, UpdateDemandDto } from './demand.dto';
import { Demand, DemandLine } from './demand.entity';

@Injectable()
export class DemandsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.demands));
  }

  async create(dto: CreateDemandDto, lines: DemandLine[]): Promise<Demand> {
    const ref = this.collection().doc();
    const item: Demand = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      date: dto.date,
      documentNo: dto.documentNo || null,
      supplierId: dto.supplierId || null,
      deliveryDate: dto.deliveryDate || null,
      note: dto.note || null,
      status: dto.status ?? 'draft',
      lines,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.DEMAND_CREATED, entity: 'demand', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<Demand | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as Demand;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<Demand> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.DEMAND_NOT_FOUND, 'Stok talebi bulunamadı');
    }
    return item;
  }

  async collect(): Promise<Demand[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Demand)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async update(id: string, dto: UpdateDemandDto, lines?: DemandLine[]): Promise<Demand> {
    const current = await this.getByIdOrThrow(id);
    const updated: Demand = {
      ...current,
      ...omitUndefined({
        date: dto.date,
        documentNo: dto.documentNo,
        supplierId: dto.supplierId,
        deliveryDate: dto.deliveryDate,
        note: dto.note,
        status: dto.status,
      }),
      lines: lines ?? current.lines,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.DEMAND_UPDATED, entity: 'demand', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.DEMAND_DELETED, entity: 'demand', entityId: id });
  }
}

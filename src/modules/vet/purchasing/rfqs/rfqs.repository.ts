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
import { CreateRfqDto, UpdateRfqDto } from './rfq.dto';
import { Rfq } from './rfq.entity';

@Injectable()
export class RfqsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.rfqs),
    );
  }

  async create(dto: CreateRfqDto): Promise<Rfq> {
    const ref = this.collection().doc();
    const item: Rfq = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      rfqNo: dto.rfqNo,
      title: dto.title,
      demandId: dto.demandId || null,
      demandDocumentNo: dto.demandDocumentNo || null,
      date: dto.date,
      deadlineDate: dto.deadlineDate,
      status: dto.status || 'collecting',
      items: dto.items,
      bids: [],
      evaluationNotes: dto.evaluationNotes || null,
    };
    await ref.set(item);
    await this.audit.record({ action: AuditAction.RFQ_CREATED, entity: 'rfq', entityId: item.id });
    return item;
  }

  async findById(id: string): Promise<Rfq | null> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return null;
    const item = snap.data() as Rfq;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<Rfq> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Teklif değerlendirme dosyası bulunamadı');
    }
    return item;
  }

  async collect(): Promise<Rfq[]> {
    const snap = await this.collection().get();
    return snap.docs
      .map((d) => d.data() as Rfq)
      .filter((r) => !isDeleted(r))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  async update(id: string, dto: UpdateRfqDto): Promise<Rfq> {
    const current = await this.getByIdOrThrow(id);
    const updated: Rfq = {
      ...current,
      ...omitUndefined({
        title: dto.title,
        demandId: dto.demandId,
        demandDocumentNo: dto.demandDocumentNo,
        date: dto.date,
        deadlineDate: dto.deadlineDate,
        status: dto.status,
        items: dto.items,
        evaluationNotes: dto.evaluationNotes,
      }),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.RFQ_UPDATED, entity: 'rfq', entityId: id });
    return updated;
  }

  async saveRaw(item: Rfq): Promise<Rfq> {
    const toSave: Rfq = {
      ...item,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(item.id).set(toSave);
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
    await this.audit.record({ action: AuditAction.RFQ_DELETED, entity: 'rfq', entityId: id });
  }
}

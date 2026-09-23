import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted, omitUndefined, touchBaseFields } from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { priceDocument } from '../sale.totals';
import { CreateSaleDto, SaleLineDto, UpdateSaleDto } from './sale.dto';
import { Sale, SaleLine } from './sale.entity';

@Injectable()
export class SalesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.sales));
  }

  async create(dto: CreateSaleDto, lines: SaleLine[]): Promise<Sale> {
    const ref = this.collection().doc();
    const priced = priceDocument(lines, dto.discount ?? 0);
    const sale: Sale = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      type: dto.type,
      date: dto.date,
      customerId: dto.customerId || null,
      supplierId: dto.supplierId || null,
      invoiceNo: dto.invoiceNo || null,
      paymentMethodId: dto.paymentMethodId || null,
      cashRegisterId: dto.cashRegisterId || null,
      discount: dto.discount ?? 0,
      remark: dto.remark || null,
      lines,
      ...priced,
    };
    await ref.set(sale);
    await this.audit.record({ action: AuditAction.SALE_CREATED, entity: 'sale', entityId: sale.id });
    return sale;
  }

  async findById(id: string): Promise<Sale | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const sale = snapshot.data() as Sale;
    return isDeleted(sale) ? null : sale;
  }

  async getByIdOrThrow(id: string): Promise<Sale> {
    const sale = await this.findById(id);
    if (!sale) {
      throw new AppException(ErrorCode.SALE_NOT_FOUND, 'Satış kaydı bulunamadı');
    }
    return sale;
  }

  async collect(): Promise<Sale[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as Sale)
      .filter((item) => !isDeleted(item))
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }

  async update(id: string, dto: UpdateSaleDto, lines?: SaleLine[]): Promise<Sale> {
    const current = await this.getByIdOrThrow(id);
    const nextLines = lines ?? current.lines;
    const discount = dto.discount ?? current.discount;
    const updated: Sale = {
      ...current,
      ...omitUndefined({
        type: dto.type,
        date: dto.date,
        customerId: dto.customerId,
        supplierId: dto.supplierId,
        invoiceNo: dto.invoiceNo,
        paymentMethodId: dto.paymentMethodId,
        cashRegisterId: dto.cashRegisterId,
        discount: dto.discount,
        remark: dto.remark,
      }),
      lines: nextLines,
      ...priceDocument(nextLines, discount),
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({ action: AuditAction.SALE_UPDATED, entity: 'sale', entityId: id });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.collection()
      .doc(id)
      .set({ ...current, deletedAt: new Date().toISOString(), ...touchBaseFields(this.tenantContext.getUserId()) });
    await this.audit.record({ action: AuditAction.SALE_DELETED, entity: 'sale', entityId: id });
  }
}

export type { SaleLineDto };

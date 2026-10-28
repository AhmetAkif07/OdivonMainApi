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
import { CreatePurchaseOrderDto, PurchaseOrderLineDto } from './purchase-order.dto';
import { PurchaseOrder, PurchaseOrderLine } from './purchase-order.entity';

@Injectable()
export class PurchaseOrdersRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.purchaseOrders),
    );
  }

  async create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    const ref = this.collection().doc();

    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;

    const lines: PurchaseOrderLine[] = dto.lines.map((l: PurchaseOrderLineDto) => {
      const gross = l.orderedQuantity * l.unitPrice;
      const discount = gross * ((l.discountPercent || 0) / 100);
      const taxable = gross - discount;
      const tax = taxable * ((l.taxRatio || 20) / 100);
      const totalAmount = taxable + tax;

      subtotal += gross;
      discountTotal += discount;
      taxTotal += tax;

      return {
        productId: l.productId,
        productName: l.productName,
        orderedQuantity: l.orderedQuantity,
        receivedQuantity: 0,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent || 0,
        taxRatio: l.taxRatio || 20,
        netAmount: Math.round(taxable * 100) / 100,
        totalAmount: Math.round(totalAmount * 100) / 100,
      };
    });

    const item: PurchaseOrder = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      orderNo: dto.orderNo,
      supplierId: dto.supplierId,
      supplierName: dto.supplierName,
      rfqId: dto.rfqId || null,
      demandId: dto.demandId || null,
      orderDate: dto.orderDate,
      expectedDeliveryDate: dto.expectedDeliveryDate,
      paymentTerm: dto.paymentTerm || null,
      paymentMethodId: dto.paymentMethodId || null,
      status: dto.status || 'draft',
      lines,
      subtotal: Math.round(subtotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      taxTotal: Math.round(taxTotal * 100) / 100,
      grandTotal: Math.round((subtotal - discountTotal + taxTotal) * 100) / 100,
      notes: dto.notes || null,
      receiptHistory: [],
    };

    await ref.set(item);
    await this.audit.record({
      action: AuditAction.PURCHASE_ORDER_CREATED,
      entity: 'purchaseOrder',
      entityId: item.id,
    });
    return item;
  }

  async findById(id: string): Promise<PurchaseOrder | null> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) return null;
    const item = snap.data() as PurchaseOrder;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<PurchaseOrder> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Satın alma siparişi bulunamadı');
    }
    return item;
  }

  async collect(): Promise<PurchaseOrder[]> {
    const snap = await this.collection().get();
    return snap.docs
      .map((d) => d.data() as PurchaseOrder)
      .filter((po) => !isDeleted(po))
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  }

  async saveRaw(item: PurchaseOrder): Promise<PurchaseOrder> {
    const toSave: PurchaseOrder = {
      ...item,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(item.id).set(toSave);
    await this.audit.record({
      action: AuditAction.PURCHASE_ORDER_UPDATED,
      entity: 'purchaseOrder',
      entityId: item.id,
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
    await this.audit.record({
      action: AuditAction.PURCHASE_ORDER_DELETED,
      entity: 'purchaseOrder',
      entityId: id,
    });
  }
}

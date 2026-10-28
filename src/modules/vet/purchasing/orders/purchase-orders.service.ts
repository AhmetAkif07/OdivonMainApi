import { Injectable, forwardRef, Inject } from '@nestjs/common';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { StockMovementsRepository } from '../../stock/stock-movements/stock-movements.repository';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { CreatePurchaseOrderDto, ReceiveGoodsDto } from './purchase-order.dto';
import { GoodsReceiptLog, PurchaseOrder } from './purchase-order.entity';
import { PurchaseOrdersRepository } from './purchase-orders.repository';

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly repo: PurchaseOrdersRepository,
    @Inject(forwardRef(() => ApprovalRequestsService))
    private readonly approvals: ApprovalRequestsService,
    private readonly movements: StockMovementsRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  create(dto: CreatePurchaseOrderDto): Promise<PurchaseOrder> {
    return this.repo.create(dto);
  }

  getById(id: string): Promise<PurchaseOrder> {
    return this.repo.getByIdOrThrow(id);
  }

  list(): Promise<PurchaseOrder[]> {
    return this.repo.collect();
  }

  delete(id: string): Promise<void> {
    return this.repo.softDelete(id);
  }

  /**
   * Siparişi onay akışına gönderir
   */
  async submitApproval(id: string): Promise<PurchaseOrder> {
    const po = await this.repo.getByIdOrThrow(id);
    const approval = await this.approvals.submit({
      targetType: 'purchase_order',
      targetId: po.id,
      documentNo: po.orderNo,
      title: `${po.orderNo} Satınalma Siparişi (${po.supplierName} - ${po.grandTotal} TL)`,
      totalAmount: po.grandTotal,
      requestedByUserName: 'Satınalma Yetkilisi',
    });

    po.approvalRequestId = approval.id;
    po.status = approval.status === 'approved' ? 'approved' : 'pending_approval';
    return this.repo.saveRaw(po);
  }

  /**
   * Sipariş için Mal Kabul (Teslim Alma) işlemi yapar ve otomatik Stok Giriş Hareketi oluşturur
   */
  async receiveGoods(id: string, dto: ReceiveGoodsDto): Promise<PurchaseOrder> {
    const po = await this.repo.getByIdOrThrow(id);

    const receivedLogs: GoodsReceiptLog['receivedLines'] = [];

    for (const rec of dto.receivedLines) {
      const line = po.lines.find((l) => l.productId === rec.productId);
      if (line) {
        line.receivedQuantity = (line.receivedQuantity || 0) + rec.quantity;
        receivedLogs.push({
          productId: rec.productId,
          productName: line.productName,
          quantity: rec.quantity,
          batchNo: rec.batchNo || null,
          expirationDate: rec.expirationDate || null,
        });

        // Otomatik Stok Girişi (StockMovement in)
        await this.movements.create(
          {
            date: dto.receiptDate,
            productId: rec.productId,
            storeId: dto.storeId,
            direction: 'in',
            reason: 'purchase',
            quantity: rec.quantity,
            unitPrice: line.unitPrice,
            remark: `${po.orderNo} Sipariş Mal Kabul (${dto.invoiceNo || 'Fiş'})`,
            batchNo: rec.batchNo || null,
            expirationDate: rec.expirationDate || null,
          },
          { type: 'purchase' as any, id: po.id },
        );
      }
    }

    const logEntry: GoodsReceiptLog = {
      id: 'rec-' + Date.now().toString(36),
      receiptDate: dto.receiptDate,
      invoiceNo: dto.invoiceNo || null,
      storeId: dto.storeId,
      storeName: dto.storeName || 'Depo',
      receivedByUserName: 'Klinik Mal Kabul Personeli',
      receivedLines: receivedLogs,
      notes: dto.notes || null,
    };

    po.receiptHistory = po.receiptHistory || [];
    po.receiptHistory.push(logEntry);

    // Durum kontrolü: Tümü teslim alındı mı, kısmi mi?
    const isAllReceived = po.lines.every((l) => l.receivedQuantity >= l.orderedQuantity);
    const hasAnyReceived = po.lines.some((l) => l.receivedQuantity > 0);

    if (isAllReceived) {
      po.status = 'received';
    } else if (hasAnyReceived) {
      po.status = 'partially_received';
    }

    return this.repo.saveRaw(po);
  }
}

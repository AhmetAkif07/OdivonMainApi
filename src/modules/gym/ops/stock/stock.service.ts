import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, isDeleted, touchBaseFields } from '../../../../shared/firestore/base-document';
import { GymStore } from '../../shared/gym-store';
import {
  CreatePurchaseOrderDto,
  CreateStockCountDto,
  PurchaseOrderQueryDto,
  PurchaseOrderStatus,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  UpdateStockCountDto,
} from './stock.dto';
import {
  applyCounts,
  countSheet,
  countSummary,
  lowStockItems,
  orderLines,
  orderTotal,
  PurchaseOrderLine,
  round2,
  StockCountLine,
  StockProduct,
} from './stock.math';

type Doc = BaseDocument & Record<string, unknown>;

interface StockChange {
  productId: string;
  /** `set`: the stock becomes `value` (count); `add`: `value` is added (goods received). */
  mode: 'set' | 'add';
  value: number;
  unitCost?: number;
}

export interface StockCount extends Doc {
  status: 'open' | 'completed' | 'cancelled';
  lines: StockCountLine[];
}

export interface PurchaseOrder extends Doc {
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  lines: PurchaseOrderLine[];
  totalAmount: number;
}

const MOVEMENT_LIMIT = 200;

/**
 * Stock count (sayım), low stock (minimum stok) and supplier purchase orders. Every stock change
 * runs in a Firestore transaction and leaves a `gymStockMovements` row (before → after).
 */
@Injectable()
export class GymStockService {
  constructor(private readonly store: GymStore) {}

  async lowStock(supplierId?: string) {
    return lowStockItems(await this.products(), supplierId);
  }

  async movements(productId?: string) {
    const items = await this.store.list<Doc>(TENANT_COLLECTION.gymStockMovements);
    return items
      .filter((item) => !productId || item['productId'] === productId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, MOVEMENT_LIMIT);
  }

  // ---- Sayım ----

  async listCounts() {
    const items = await this.store.list<StockCount>(TENANT_COLLECTION.gymStockCounts);
    return items
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((item) => ({ ...withoutLines(item), summary: countSummary(item.lines ?? []) }));
  }

  async getCount(id: string) {
    const count = await this.count(id);
    return { ...count, summary: countSummary(count.lines ?? []) };
  }

  /** Opens a count sheet with the current (expected) stock of the chosen or all active products. */
  async createCount(dto: CreateStockCountDto) {
    const lines = countSheet(await this.products(), dto.productIds);
    if (!lines.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'No products to count');
    }
    const created = await this.store.create<StockCount>(TENANT_COLLECTION.gymStockCounts, {
      status: 'open',
      notes: dto.notes ?? '',
      lines,
      completedAt: null,
    });
    return { ...created, summary: countSummary(created.lines) };
  }

  async updateCount(id: string, dto: UpdateStockCountDto) {
    const count = await this.openCount(id);
    const lines = dto.entries
      ? applyCounts(count.lines, dto.entries.map((entry) => ({ productId: entry.productId, counted: entry.counted ?? null })))
      : count.lines;
    const updated = await this.store.update<StockCount>(
      TENANT_COLLECTION.gymStockCounts,
      id,
      ErrorCode.GYM_STOCK_COUNT_NOT_FOUND,
      'Stock count not found',
      { lines, notes: dto.notes },
    );
    return { ...updated, summary: countSummary(updated.lines ?? []) };
  }

  /** Sets every counted product's stock to the counted quantity; uncounted lines are left alone. */
  async completeCount(id: string) {
    const count = await this.openCount(id);
    const counted = count.lines.filter((line) => line.counted !== null);
    if (!counted.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Nothing has been counted yet');
    }
    await this.applyStockChanges(
      counted.map((line) => ({ productId: line.productId, mode: 'set', value: line.counted as number })),
      { type: 'count', referenceId: id, note: 'Stok sayımı' },
    );
    const updated = await this.store.update<StockCount>(
      TENANT_COLLECTION.gymStockCounts,
      id,
      ErrorCode.GYM_STOCK_COUNT_NOT_FOUND,
      'Stock count not found',
      { status: 'completed', completedAt: new Date().toISOString() },
    );
    return { ...updated, summary: countSummary(updated.lines ?? []) };
  }

  async cancelCount(id: string) {
    await this.openCount(id);
    return this.store.update<StockCount>(
      TENANT_COLLECTION.gymStockCounts,
      id,
      ErrorCode.GYM_STOCK_COUNT_NOT_FOUND,
      'Stock count not found',
      { status: 'cancelled' },
    );
  }

  // ---- Tedarikçi siparişi ----

  async listOrders(query: PurchaseOrderQueryDto) {
    const items = await this.store.list<PurchaseOrder>(TENANT_COLLECTION.gymPurchaseOrders);
    return items
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.supplierId || item.supplierId === query.supplierId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getOrder(id: string) {
    return this.order(id);
  }

  async createOrder(dto: CreatePurchaseOrderDto) {
    const supplier = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymSuppliers,
      dto.supplierId,
      ErrorCode.GYM_SUPPLIER_NOT_FOUND,
      'Supplier not found',
    );
    const lines = orderLines(dto.lines, await this.productMap(dto.lines.map((line) => line.productId)));
    return this.store.create<PurchaseOrder>(TENANT_COLLECTION.gymPurchaseOrders, {
      status: 'draft',
      supplierId: supplier.id,
      supplierName: String(supplier['name'] ?? 'Tedarikçi'),
      lines,
      totalAmount: orderTotal(lines),
      expectedDate: dto.expectedDate ?? null,
      notes: dto.notes ?? '',
      orderedAt: null,
      receivedAt: null,
      receivedAmount: null,
    });
  }

  async updateOrder(id: string, dto: UpdatePurchaseOrderDto) {
    const order = await this.order(id);
    if (order.status !== 'draft' && order.status !== 'ordered') {
      throw new AppException(ErrorCode.GYM_STOCK_STATE, `A ${order.status} order cannot be changed`);
    }
    const lines = dto.lines ? orderLines(dto.lines, await this.productMap(dto.lines.map((line) => line.productId))) : undefined;
    return this.store.update<PurchaseOrder>(
      TENANT_COLLECTION.gymPurchaseOrders,
      id,
      ErrorCode.GYM_PURCHASE_ORDER_NOT_FOUND,
      'Purchase order not found',
      {
        lines,
        totalAmount: lines ? orderTotal(lines) : undefined,
        expectedDate: dto.expectedDate,
        notes: dto.notes,
      },
    );
  }

  /** Draft → ordered (sent to the supplier). */
  async markOrdered(id: string) {
    const order = await this.order(id);
    if (order.status !== 'draft') {
      throw new AppException(ErrorCode.GYM_STOCK_STATE, 'Only a draft order can be sent');
    }
    return this.setOrder(id, { status: 'ordered', orderedAt: new Date().toISOString() });
  }

  async cancelOrder(id: string) {
    const order = await this.order(id);
    if (order.status === 'received' || order.status === 'cancelled') {
      throw new AppException(ErrorCode.GYM_STOCK_STATE, `A ${order.status} order cannot be cancelled`);
    }
    return this.setOrder(id, { status: 'cancelled' });
  }

  /**
   * Goods arrived: adds the received quantities to stock, updates the product cost to the order's
   * unit cost and adds the received value to the supplier's balance (what we owe).
   */
  async receiveOrder(id: string, dto: ReceivePurchaseOrderDto) {
    const order = await this.order(id);
    if (order.status !== 'draft' && order.status !== 'ordered') {
      throw new AppException(ErrorCode.GYM_STOCK_STATE, `A ${order.status} order cannot be received`);
    }
    const received = new Map((dto.lines ?? []).map((line) => [line.productId, line.receivedQuantity]));
    const lines = order.lines.map((line) => ({
      ...line,
      receivedQuantity: dto.lines ? (received.get(line.productId) ?? 0) : line.quantity,
    }));
    const changes = lines
      .filter((line) => line.receivedQuantity > 0)
      .map((line) => ({ productId: line.productId, mode: 'add' as const, value: line.receivedQuantity, unitCost: line.unitCost }));
    if (!changes.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Nothing was received');
    }
    const receivedAmount = round2(lines.reduce((sum, line) => sum + line.receivedQuantity * line.unitCost, 0));
    await this.applyStockChanges(changes, {
      type: 'purchase',
      referenceId: id,
      note: `${order.supplierName} siparişi`,
    });
    await this.addToSupplierBalance(order.supplierId, receivedAmount);
    return this.setOrder(id, { status: 'received', lines, receivedAt: new Date().toISOString(), receivedAmount });
  }

  // ---- helpers ----

  private async applyStockChanges(changes: StockChange[], movement: { type: 'count' | 'purchase'; referenceId: string; note: string }) {
    const products = this.store.collection(TENANT_COLLECTION.gymShopProducts);
    const movements = this.store.collection(TENANT_COLLECTION.gymStockMovements);
    const userId = this.store.userId();
    const tenantId = this.store.tenantId();
    const refs = changes.map((change) => products.doc(change.productId));
    await products.firestore.runTransaction(async (tx) => {
      const snapshots = await tx.getAll(...refs);
      const now = new Date().toISOString();
      snapshots.forEach((snapshot, index) => {
        const product = snapshot.data() as Doc | undefined;
        if (!snapshot.exists || !product || isDeleted(product)) {
          throw new AppException(ErrorCode.GYM_PRODUCT_NOT_FOUND, 'Product not found');
        }
        const change = changes[index];
        const before = Number(product['stock'] ?? 0) || 0;
        const after = change.mode === 'set' ? change.value : before + change.value;
        tx.update(refs[index], {
          stock: after,
          ...(change.unitCost !== undefined && change.unitCost > 0 ? { cost: change.unitCost } : {}),
          ...touchBaseFields(userId, now),
        });
        if (after !== before) {
          const ref = movements.doc();
          tx.set(ref, {
            ...createBaseFields(ref.id, userId, now),
            tenantId,
            productId: change.productId,
            productName: String(product['name'] ?? ''),
            type: movement.type,
            delta: after - before,
            before,
            after,
            referenceId: movement.referenceId,
            note: movement.note,
          });
        }
      });
    });
  }

  private async addToSupplierBalance(supplierId: string, amount: number) {
    if (amount <= 0) return;
    const supplier = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymSuppliers,
      supplierId,
      ErrorCode.GYM_SUPPLIER_NOT_FOUND,
      'Supplier not found',
    );
    await this.store.update(TENANT_COLLECTION.gymSuppliers, supplierId, ErrorCode.GYM_SUPPLIER_NOT_FOUND, 'Supplier not found', {
      balance: round2((Number(supplier['balance'] ?? 0) || 0) + amount),
    });
  }

  private async products(): Promise<StockProduct[]> {
    return (await this.store.list<Doc>(TENANT_COLLECTION.gymShopProducts)) as unknown as StockProduct[];
  }

  private async productMap(ids: string[]) {
    const wanted = new Set(ids);
    const products = (await this.products()).filter((product) => wanted.has(product.id));
    const map = new Map(products.map((product) => [product.id, product]));
    const missing = ids.find((id) => !map.has(id));
    if (missing) {
      throw new AppException(ErrorCode.GYM_PRODUCT_NOT_FOUND, 'Product not found');
    }
    return map;
  }

  private count(id: string) {
    return this.store.getOrThrow<StockCount>(TENANT_COLLECTION.gymStockCounts, id, ErrorCode.GYM_STOCK_COUNT_NOT_FOUND, 'Stock count not found');
  }

  private async openCount(id: string) {
    const count = await this.count(id);
    if (count.status !== 'open') {
      throw new AppException(ErrorCode.GYM_STOCK_STATE, `The count is already ${count.status}`);
    }
    return count;
  }

  private order(id: string) {
    return this.store.getOrThrow<PurchaseOrder>(
      TENANT_COLLECTION.gymPurchaseOrders,
      id,
      ErrorCode.GYM_PURCHASE_ORDER_NOT_FOUND,
      'Purchase order not found',
    );
  }

  private setOrder(id: string, patch: object) {
    return this.store.update<PurchaseOrder>(
      TENANT_COLLECTION.gymPurchaseOrders,
      id,
      ErrorCode.GYM_PURCHASE_ORDER_NOT_FOUND,
      'Purchase order not found',
      patch,
    );
  }
}

function withoutLines<T extends { lines?: unknown }>(item: T): Omit<T, 'lines'> {
  const { lines: _lines, ...rest } = item;
  return rest;
}

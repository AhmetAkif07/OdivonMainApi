import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { HairNotificationsService } from '../notifications/hair-notifications.service';
import { hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto, inclusiveTo, searchTerm } from '../shared/hair-list.dto';
import { HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { live, matchesSearch, num, str } from '../shared/hair-tx';
import { CreateInventoryTransactionDto } from './inventory.dto';

/** Stock movements (S-004/S-006) and the low-stock list (S-005). */
@Injectable()
export class HairInventoryService {
  constructor(
    private readonly store: HairStore,
    private readonly notifications: HairNotificationsService,
  ) {}

  async listTransactions(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    if (query.branchId) this.store.assertBranchAccess(actor, query.branchId);
    const branches = query.branchId ? [query.branchId] : actor.branchIds;
    return this.store.list(TENANT_COLLECTION.hairInventoryTransactions, {
      dateField: 'date',
      from: query.from,
      to: inclusiveTo(query.to),
      equals: { productId: query.productId, type: query.type },
      match: (item) => {
        const branch = str(item['branchId']);
        return !branches || !branch || branches.includes(branch);
      },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /** Manual stock in / out / count adjustment, applied atomically with the product's stock. */
  async createTransaction(dto: CreateInventoryTransactionDto) {
    const actor = await this.store.actorOrThrow();
    if (dto.branchId) this.store.assertBranchAccess(actor, dto.branchId);
    if (dto.type !== 'adjustment' && dto.quantity <= 0) throw hairInvalid('Miktar sıfırdan büyük olmalıdır.');
    const date = dto.date ?? dateIdInTz(await this.store.timeZone());
    const productRef = this.store.ref(TENANT_COLLECTION.hairProducts, dto.productId);
    const txRef = this.store.newRef(TENANT_COLLECTION.hairInventoryTransactions);
    const userId = this.store.userId();

    const result = await this.store.runTransaction(async (tx) => {
      const product = live(await tx.get(productRef));
      if (!product) throw hairNotFound('Ürün bulunamadı.');
      const before = num(product['currentStock']);
      const delta = dto.type === 'in' ? dto.quantity : dto.type === 'out' ? -dto.quantity : dto.quantity - before;
      const stockAfter = Math.round((before + delta) * 1000) / 1000;
      if (stockAfter < 0) throw hairPrecondition(`"${str(product['name'])}" için stok yetersiz (mevcut ${before}).`);
      const now = new Date().toISOString();
      const doc = {
        ...createBaseFields(txRef.id, userId, now),
        productId: dto.productId,
        productName: str(product['name']),
        type: dto.type,
        quantity: dto.quantity,
        delta,
        stockBefore: before,
        stockAfter,
        reason: dto.reason.trim(),
        branchId: dto.branchId ?? (str(product['branchId']) || null),
        date,
      };
      tx.update(productRef, { currentStock: stockAfter, updatedAt: now, updatedBy: userId });
      tx.set(txRef, doc);
      return { doc, low: stockAfter <= num(product['minStock']) && delta < 0, minStock: num(product['minStock']) };
    });

    await this.store.audit('hairInventoryTransactions', 'create', txRef.id, null, {
      productId: dto.productId,
      delta: result.doc.delta,
      stockAfter: result.doc.stockAfter,
    });
    if (result.low) {
      await this.notifications.notifyStaff({
        branchId: result.doc.branchId,
        type: 'lowStock',
        title: 'Düşük stok',
        body: `${result.doc.productName}: stok ${result.doc.stockAfter} (eşik ${result.minStock})`,
        link: `/inventory?productId=${dto.productId}`,
      });
    }
    return result.doc;
  }

  /** Active products at or below their minimum stock (S-005). */
  async lowStock(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    if (query.branchId) this.store.assertBranchAccess(actor, query.branchId);
    const branches = query.branchId ? [query.branchId] : actor.branchIds;
    const term = searchTerm(query);
    const products = await this.store.rows(TENANT_COLLECTION.hairProducts);
    return products
      .filter((p) => p['active'] !== false && num(p['currentStock']) <= num(p['minStock']))
      .filter((p) => !branches || !p['branchId'] || branches.includes(str(p['branchId'])))
      .filter((p) => matchesSearch(p, term, ['name', 'brand', 'barcode']))
      .map((p) => ({ ...p, shortage: Math.max(0, num(p['minStock']) - num(p['currentStock'])) }) as HairDoc & { shortage: number })
      .sort((a, b) => b.shortage - a.shortage || str(a['name']).localeCompare(str(b['name']), 'tr'));
  }
}

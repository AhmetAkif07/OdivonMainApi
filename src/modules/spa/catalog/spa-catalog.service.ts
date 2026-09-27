import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import { spaInvalid, spaNotFound } from '../shared/spa-errors';
import { SpaDoc, SpaStore } from '../shared/spa-store';
import { CreateStockMovementDto } from './catalog.dto';

@Injectable()
export class SpaCatalogService {
  constructor(private readonly store: SpaStore) {}

  /** Writes the movement log entry and adjusts `mevcutStok` by the same signed delta atomically. */
  async recordStockMovement(dto: CreateStockMovementDto) {
    if (dto.qty === 0) throw spaInvalid('Stok miktarı sıfır olamaz.');
    const productRef = this.store.doc(TENANT_COLLECTION.spaProducts, dto.productId);
    const movementRef = this.store.collection(TENANT_COLLECTION.spaStockMovements).doc();
    const userId = this.store.userId();

    const { before, after } = await this.store.runTransaction(async (tx) => {
      const snapshot = await tx.get(productRef);
      const product = snapshot.exists ? (snapshot.data() as SpaDoc) : null;
      if (!product || isDeleted(product)) throw spaNotFound('Ürün bulunamadı.');
      const current = Number(product['mevcutStok'] ?? 0);
      const next = current + dto.qty;
      if (next < 0) throw spaInvalid('Stok miktarı negatif olamaz.');
      const now = new Date().toISOString();
      tx.update(productRef, { mevcutStok: next, updatedAt: now, updatedBy: userId });
      tx.set(movementRef, {
        ...createBaseFields(movementRef.id, userId, now),
        productId: dto.productId,
        type: dto.type,
        qty: dto.qty,
        note: dto.note?.trim() || null,
      });
      return { before: current, after: next };
    });

    await this.store.audit(
      'products',
      'update',
      dto.productId,
      { mevcutStok: before },
      { mevcutStok: after, hareket: dto.type },
    );
    return { id: movementRef.id, productId: dto.productId, mevcutStok: after };
  }
}

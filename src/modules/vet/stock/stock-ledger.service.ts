import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../shared/http/column-filters';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { ProductsRepository } from '../definitions/products/products.repository';
import { StoresRepository } from '../definitions/stores/stores.repository';
import {
  StockBalance,
  StockDirection,
  StockMovement,
  StockReason,
  StockSource,
} from './stock-movements/stock-movement.entity';
import { StockMovementsRepository } from './stock-movements/stock-movements.repository';

export interface LedgerLineInput {
  productId: string;
  quantity: number;
  unitPrice?: number | null;
  date: string;
  remark?: string | null;
}

@Injectable()
export class StockLedgerService {
  constructor(
    private readonly movements: StockMovementsRepository,
    private readonly products: ProductsRepository,
    private readonly stores: StoresRepository,
  ) {}

  async apply(
    source: StockSource,
    direction: StockDirection,
    reason: StockReason,
    lines: LedgerLineInput[],
  ): Promise<void> {
    const resolved = await this.resolveLines(lines);
    if (direction === 'out') {
      await this.assertEnough(source, resolved);
    }
    await this.replace(source, direction, reason, resolved);
  }

  async clear(source: StockSource): Promise<void> {
    const existing = await this.movements.findBySource(source.type, source.id);
    for (const item of existing) {
      await this.movements.softDelete(item.id);
    }
  }

  async listBalances(query: PagingQueryDto): Promise<PaginatedResult<StockBalance>> {
    const items = (await this.balances()).filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  isManual(movement: StockMovement): boolean {
    return !movement.source || movement.source.type === 'manual';
  }

  async available(productId: string, storeId: string, exclude?: StockSource): Promise<number> {
    const map = await this.onHandExcluding(exclude ?? { type: 'manual', id: '' });
    return map.get(`${productId}:${storeId}`) ?? 0;
  }

  private async resolveLines(lines: LedgerLineInput[]): Promise<Array<LedgerLineInput & { storeId: string }>> {
    const resolved: Array<LedgerLineInput & { storeId: string }> = [];
    for (const line of lines) {
      if (line.quantity <= 0) {
        continue;
      }
      const product = await this.products.findById(line.productId);
      if (!product) {
        throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen ürün bulunamadı');
      }
      if (product.productType === 'service') {
        continue;
      }
      if (!product.storeId) {
        throw new AppException(ErrorCode.STOCK_INVALID, `${product.name} için depo tanımlı değil`);
      }
      if (!(await this.stores.findById(product.storeId))) {
        throw new AppException(ErrorCode.STOCK_INVALID, `${product.name} için seçilen depo bulunamadı`);
      }
      resolved.push({ ...line, storeId: product.storeId });
    }
    return resolved;
  }

  private async assertEnough(
    source: StockSource,
    lines: Array<LedgerLineInput & { storeId: string }>,
  ): Promise<void> {
    const onHand = await this.onHandExcluding(source);
    for (const line of lines) {
      const key = `${line.productId}:${line.storeId}`;
      const available = onHand.get(key) ?? 0;
      if (available + 1e-9 < line.quantity) {
        const product = await this.products.findById(line.productId);
        throw new AppException(
          ErrorCode.STOCK_INSUFFICIENT,
          `${product?.name ?? 'Ürün'} için yeterli stok yok (kalan ${available})`,
        );
      }
      onHand.set(key, available - line.quantity);
    }
  }

  private async onHandExcluding(source: StockSource): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    for (const item of await this.movements.collect()) {
      if (item.source?.type === source.type && item.source.id === source.id) {
        continue;
      }
      const key = `${item.productId}:${item.storeId}`;
      const signed = item.direction === 'in' ? item.quantity : -item.quantity;
      map.set(key, (map.get(key) ?? 0) + signed);
    }
    return map;
  }

  private async replace(
    source: StockSource,
    direction: StockDirection,
    reason: StockReason,
    lines: Array<LedgerLineInput & { storeId: string }>,
  ): Promise<void> {
    await this.clear(source);
    for (const line of lines) {
      await this.movements.create(
        {
          date: line.date,
          productId: line.productId,
          storeId: line.storeId,
          direction,
          reason,
          quantity: line.quantity,
          unitPrice: line.unitPrice ?? null,
          remark: line.remark ?? null,
        },
        source,
      );
    }
  }

  private async balances(): Promise<StockBalance[]> {
    const items = await this.movements.collect();
    const grouped = new Map<string, { productId: string; storeId: string; onHand: number }>();
    for (const item of items) {
      const key = `${item.productId}:${item.storeId}`;
      const current = grouped.get(key) ?? { productId: item.productId, storeId: item.storeId, onHand: 0 };
      current.onHand += item.direction === 'in' ? item.quantity : -item.quantity;
      grouped.set(key, current);
    }
    const [products, stores] = await Promise.all([
      this.products.findByIds([...grouped.values()].map((item) => item.productId)),
      this.stores.findByIds([...grouped.values()].map((item) => item.storeId)),
    ]);
    return [...grouped.values()]
      .map((item) => {
        const product = products.get(item.productId);
        const critical = product?.criticalAmount ?? null;
        const onHand = Math.round(item.onHand * 1000) / 1000;
        return {
          id: `${item.productId}:${item.storeId}`,
          createdAt: '1970-01-01T00:00:00.000Z',
          productId: item.productId,
          productName: product?.name ?? '',
          storeId: item.storeId,
          storeName: stores.get(item.storeId)?.name ?? '',
          onHand,
          criticalAmount: critical,
          low: critical !== null && onHand <= critical,
        };
      })
      .sort((left, right) => left.productName.localeCompare(right.productName, 'tr') || left.storeName.localeCompare(right.storeName, 'tr'));
  }
}

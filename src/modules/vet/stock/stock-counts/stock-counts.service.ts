import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { ProductsRepository } from '../../definitions/products/products.repository';
import { StoresRepository } from '../../definitions/stores/stores.repository';
import { StockLedgerService } from '../stock-ledger.service';
import { StockMovementsRepository } from '../stock-movements/stock-movements.repository';
import { CreateStockCountDto, StockCountQueryDto, UpdateStockCountDto } from './stock-count.dto';
import { StockCount, StockCountLine, StockCountView } from './stock-count.entity';
import { StockCountsRepository } from './stock-counts.repository';

const round3 = (value: number) => Math.round(value * 1000) / 1000;

@Injectable()
export class StockCountsService {
  constructor(
    private readonly counts: StockCountsRepository,
    private readonly ledger: StockLedgerService,
    private readonly movements: StockMovementsRepository,
    private readonly products: ProductsRepository,
    private readonly stores: StoresRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  /** Creates a count sheet with the current on-hand of every stocked product in the store. */
  async create(dto: CreateStockCountDto): Promise<StockCountView> {
    if (!(await this.stores.findById(dto.storeId))) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen depo bulunamadı');
    }
    const onHand = await this.ledger.onHandMap();
    const stockable = (await this.products.collect()).filter((item) => item.productType !== 'service');
    const wanted = dto.productIds ? new Set(dto.productIds) : null;
    const lines: StockCountLine[] = stockable
      .filter((product) =>
        wanted
          ? wanted.has(product.id)
          : product.storeId === dto.storeId || (onHand.get(`${product.id}:${dto.storeId}`) ?? 0) !== 0,
      )
      .map((product) => ({
        productId: product.id,
        systemQuantity: round3(onHand.get(`${product.id}:${dto.storeId}`) ?? 0),
        countedQuantity: null,
        difference: null,
      }));
    if (!lines.length) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Bu depoda sayılacak ürün yok');
    }
    const created = await this.counts.create({
      storeId: dto.storeId,
      date: dto.date,
      status: 'draft',
      remark: dto.remark || null,
      lines,
      appliedAt: null,
      appliedBy: null,
    });
    return this.toView(created);
  }

  /** Records counted quantities. Lines not in the request keep their current value. */
  async update(id: string, dto: UpdateStockCountDto): Promise<StockCountView> {
    const current = await this.getDraft(id);
    const byProduct = new Map(current.lines.map((line) => [line.productId, { ...line }]));
    for (const input of dto.lines ?? []) {
      const line = byProduct.get(input.productId);
      if (!line) {
        throw new AppException(ErrorCode.STOCK_INVALID, 'Ürün bu sayım listesinde yok');
      }
      const counted = input.countedQuantity ?? null;
      line.countedQuantity = counted === null ? null : round3(counted);
      line.difference = counted === null ? null : round3(counted - line.systemQuantity);
    }
    const saved = await this.counts.save(
      {
        ...current,
        remark: dto.remark !== undefined ? dto.remark || null : current.remark,
        lines: [...byProduct.values()],
      },
      'updated',
    );
    return this.toView(saved);
  }

  /**
   * Books the differences as stock adjustments. The difference is taken against on-hand at the
   * moment of applying, so sales made between creating and applying the sheet are not undone.
   */
  async apply(id: string): Promise<StockCountView> {
    const current = await this.getDraft(id);
    const counted = current.lines.filter((line) => line.countedQuantity !== null);
    if (!counted.length) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Sayılmış ürün yok');
    }
    const onHand = await this.ledger.onHandMap();
    const source = { type: 'count' as const, id: current.id };
    const lines = current.lines.map((line) => {
      if (line.countedQuantity === null) {
        return line;
      }
      const systemQuantity = round3(onHand.get(`${line.productId}:${current.storeId}`) ?? 0);
      return { ...line, systemQuantity, difference: round3(line.countedQuantity - systemQuantity) };
    });
    for (const line of lines) {
      if (!line.difference) {
        continue;
      }
      await this.movements.create(
        {
          date: current.date,
          productId: line.productId,
          storeId: current.storeId,
          direction: line.difference > 0 ? 'in' : 'out',
          reason: 'adjustment',
          quantity: Math.abs(line.difference),
          remark: `Stok sayımı farkı`,
        },
        source,
      );
    }
    const saved = await this.counts.save(
      {
        ...current,
        lines,
        status: 'applied',
        appliedAt: new Date().toISOString(),
        appliedBy: this.tenantContext.getUserId(),
      },
      'applied',
    );
    return this.toView(saved);
  }

  async get(id: string): Promise<StockCountView> {
    return this.toView(await this.counts.getByIdOrThrow(id));
  }

  async list(query: StockCountQueryDto): Promise<PaginatedResult<StockCountView>> {
    const items = (await this.counts.collect()).filter(
      (item) => (!query.storeId || item.storeId === query.storeId) && (!query.status || item.status === query.status),
    );
    const views = [];
    const stores = await this.stores.findByIds(items.map((item) => item.storeId));
    for (const item of items) {
      views.push({
        ...item,
        lines: [],
        storeName: stores.get(item.storeId)?.name ?? '',
        countedLines: item.lines.filter((line) => line.countedQuantity !== null).length,
        totalLines: item.lines.length,
      });
    }
    return paginateInMemory(
      views.filter((item) => matchesColumnFilters(item, query.filters)),
      query.limit,
      query.cursor,
    );
  }

  async remove(id: string): Promise<void> {
    await this.counts.softDelete(await this.getDraft(id));
  }

  private async getDraft(id: string): Promise<StockCount> {
    const item = await this.counts.getByIdOrThrow(id);
    if (item.status !== 'draft') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Uygulanmış sayım değiştirilemez');
    }
    return item;
  }

  private async toView(item: StockCount): Promise<StockCountView> {
    const [store, products] = await Promise.all([
      this.stores.findById(item.storeId),
      this.products.findByIds(item.lines.map((line) => line.productId)),
    ]);
    return {
      ...item,
      storeName: store?.name ?? '',
      lines: item.lines.map((line) => ({ ...line, productName: products.get(line.productId)?.name ?? '' })),
      countedLines: item.lines.filter((line) => line.countedQuantity !== null).length,
      totalLines: item.lines.length,
    };
  }
}

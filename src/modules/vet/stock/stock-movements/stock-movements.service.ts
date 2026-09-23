import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { ProductsRepository } from '../../definitions/products/products.repository';
import { StoresRepository } from '../../definitions/stores/stores.repository';
import { StockLedgerService } from '../stock-ledger.service';
import { CreateStockMovementDto, ListStockMovementsQueryDto, UpdateStockMovementDto } from './stock-movement.dto';
import { StockMovement, StockMovementListItem } from './stock-movement.entity';
import { StockMovementsRepository } from './stock-movements.repository';

@Injectable()
export class StockMovementsService {
  constructor(
    private readonly movements: StockMovementsRepository,
    private readonly products: ProductsRepository,
    private readonly stores: StoresRepository,
    private readonly ledger: StockLedgerService,
  ) {}

  async create(dto: CreateStockMovementDto): Promise<StockMovement> {
    await this.assertRefs(dto.productId, dto.storeId);
    await this.assertOutbound(dto.productId, dto.storeId, dto.direction, dto.quantity);
    return this.movements.create(dto);
  }

  getById(id: string): Promise<StockMovement> {
    return this.movements.getByIdOrThrow(id);
  }

  async list(query: ListStockMovementsQueryDto): Promise<PaginatedResult<StockMovementListItem>> {
    const items = (await this.withNames(await this.movements.collect()))
      .filter((item) => !query.direction || item.direction === query.direction)
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateStockMovementDto): Promise<StockMovement> {
    const current = await this.movements.getByIdOrThrow(id);
    this.assertManual(current);
    const productId = dto.productId ?? current.productId;
    const storeId = dto.storeId ?? current.storeId;
    const direction = dto.direction ?? current.direction;
    const quantity = dto.quantity ?? current.quantity;
    await this.assertRefs(productId, storeId);
    await this.assertOutbound(productId, storeId, direction, quantity, current.source);
    return this.movements.update(id, dto);
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.movements.getByIdOrThrow(id);
    this.assertManual(current);
    return this.movements.softDelete(id);
  }

  private assertManual(movement: StockMovement): void {
    if (!this.ledger.isManual(movement)) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Sistem hareketi satış, aşı veya talepten gelir; burada değiştirilemez');
    }
  }

  private async assertOutbound(
    productId: string,
    storeId: string,
    direction: StockMovement['direction'],
    quantity: number,
    exclude?: StockMovement['source'],
  ): Promise<void> {
    if (direction !== 'out') {
      return;
    }
    const available = await this.ledger.available(productId, storeId, exclude);
    if (available + 1e-9 < quantity) {
      const product = await this.products.findById(productId);
      throw new AppException(
        ErrorCode.STOCK_INSUFFICIENT,
        `${product?.name ?? 'Ürün'} için yeterli stok yok (kalan ${available})`,
      );
    }
  }

  private async assertRefs(productId: string, storeId: string): Promise<void> {
    if (!(await this.products.findById(productId))) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen ürün bulunamadı');
    }
    if (!(await this.stores.findById(storeId))) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen depo bulunamadı');
    }
  }

  private async withNames(items: StockMovement[]): Promise<StockMovementListItem[]> {
    const [products, stores] = await Promise.all([
      this.products.findByIds(items.map((item) => item.productId)),
      this.stores.findByIds(items.map((item) => item.storeId)),
    ]);
    return items.map((item) => ({
      ...item,
      productName: products.get(item.productId)?.name ?? '',
      storeName: stores.get(item.storeId)?.name ?? '',
    }));
  }
}

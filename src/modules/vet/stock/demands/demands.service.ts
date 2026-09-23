import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { ProductsRepository } from '../../definitions/products/products.repository';
import { SuppliersRepository } from '../../definitions/suppliers/suppliers.repository';
import { StockLedgerService } from '../stock-ledger.service';
import { CreateDemandDto, DemandLineDto, ListDemandsQueryDto, UpdateDemandDto } from './demand.dto';
import { Demand, DemandLine, DemandListItem } from './demand.entity';
import { DemandsRepository } from './demands.repository';

@Injectable()
export class DemandsService {
  constructor(
    private readonly demands: DemandsRepository,
    private readonly products: ProductsRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly ledger: StockLedgerService,
  ) {}

  async create(dto: CreateDemandDto): Promise<Demand> {
    await this.assertSupplier(dto.supplierId);
    const item = await this.demands.create(dto, await this.resolveLines(dto.lines));
    await this.syncStock(item);
    return item;
  }

  getById(id: string): Promise<Demand> {
    return this.demands.getByIdOrThrow(id);
  }

  async list(query: ListDemandsQueryDto): Promise<PaginatedResult<DemandListItem>> {
    const items = (await this.withNames(await this.demands.collect()))
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateDemandDto): Promise<Demand> {
    const current = await this.demands.getByIdOrThrow(id);
    const supplierId = dto.supplierId === undefined ? current.supplierId : dto.supplierId;
    await this.assertSupplier(supplierId);
    const lines = dto.lines ? await this.resolveLines(dto.lines) : undefined;
    const item = await this.demands.update(id, dto, lines);
    await this.syncStock(item);
    return item;
  }

  async softDelete(id: string): Promise<void> {
    await this.demands.softDelete(id);
    await this.ledger.clear({ type: 'demand', id });
  }

  private async syncStock(item: Demand): Promise<void> {
    const source = { type: 'demand' as const, id: item.id };
    if (item.status !== 'completed') {
      await this.ledger.clear(source);
      return;
    }
    await this.ledger.apply(
      source,
      'in',
      'demand',
      item.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        date: item.date,
        remark: item.documentNo,
      })),
    );
  }

  private async assertSupplier(supplierId?: string | null): Promise<void> {
    if (supplierId && !(await this.suppliers.findById(supplierId))) {
      throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen tedarikçi bulunamadı');
    }
  }

  private async resolveLines(lines: DemandLineDto[]): Promise<DemandLine[]> {
    const resolved: DemandLine[] = [];
    for (const line of lines) {
      if (!(await this.products.findById(line.productId))) {
        throw new AppException(ErrorCode.STOCK_INVALID, 'Seçilen ürün bulunamadı');
      }
      resolved.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice ?? 0,
      });
    }
    return resolved;
  }

  private async withNames(items: Demand[]): Promise<DemandListItem[]> {
    const suppliers = await this.suppliers.findByIds(items.map((item) => item.supplierId));
    return items.map((item) => ({
      ...item,
      supplierName: item.supplierId ? (suppliers.get(item.supplierId)?.name ?? '') : '',
    }));
  }
}

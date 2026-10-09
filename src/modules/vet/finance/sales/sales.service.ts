import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { CustomersRepository } from '../../customers/customers.repository';
import { CashRegistersRepository } from '../../definitions/cash-registers/cash-registers.repository';
import { PaymentMethodsRepository } from '../../definitions/payment-methods/payment-methods.repository';
import { ProductsRepository } from '../../definitions/products/products.repository';
import { SuppliersRepository } from '../../definitions/suppliers/suppliers.repository';
import { TaxesRepository } from '../../definitions/taxes/taxes.repository';
import { StockLedgerService } from '../../stock/stock-ledger.service';
import { CreateSaleDto, ListSalesQueryDto, SaleLineDto, UpdateSaleDto } from './sale.dto';
import { Sale, SaleLine, SaleListItem } from './sale.entity';
import { SalesRepository } from './sales.repository';

@Injectable()
export class SalesService {
  constructor(
    private readonly sales: SalesRepository,
    private readonly customers: CustomersRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly products: ProductsRepository,
    private readonly taxes: TaxesRepository,
    private readonly paymentMethods: PaymentMethodsRepository,
    private readonly cashRegisters: CashRegistersRepository,
    private readonly ledger: StockLedgerService,
  ) {}

  async create(dto: CreateSaleDto): Promise<Sale> {
    this.assertParty(dto.type, dto.customerId, dto.supplierId, dto.isQuickSale);
    const lines = await this.resolveLines(dto.lines);
    const sale = await this.sales.create(dto, lines);
    await this.syncStock(sale);
    return sale;
  }

  getById(id: string): Promise<Sale> {
    return this.sales.getByIdOrThrow(id);
  }

  findByIds(ids: Array<string | null | undefined>) {
    return this.sales.findByIds(ids);
  }

  async list(query: ListSalesQueryDto): Promise<PaginatedResult<SaleListItem>> {
    const items = (await this.withNames(await this.sales.collect()))
      .filter((item) => !query.type || item.type === query.type)
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateSaleDto): Promise<Sale> {
    const current = await this.sales.getByIdOrThrow(id);
    const type = dto.type ?? current.type;
    const customerId = dto.customerId === undefined ? current.customerId : dto.customerId;
    const supplierId = dto.supplierId === undefined ? current.supplierId : dto.supplierId;
    this.assertParty(type, customerId, supplierId, dto.isQuickSale);
    const lines = dto.lines ? await this.resolveLines(dto.lines) : undefined;
    const sale = await this.sales.update(id, dto, lines);
    await this.syncStock(sale);
    return sale;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.sales.getByIdOrThrow(id);
    await this.sales.softDelete(id);
    await this.ledger.clear({ type: current.type === 'purchase' ? 'purchase' : 'sale', id });
  }

  private async syncStock(sale: Sale): Promise<void> {
    const purchase = sale.type === 'purchase';
    await this.ledger.apply(
      { type: purchase ? 'purchase' : 'sale', id: sale.id },
      purchase ? 'in' : 'out',
      purchase ? 'purchase' : 'sale',
      sale.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        date: sale.date,
        remark: sale.invoiceNo,
      })),
    );
  }

  private assertParty(type: 'sale' | 'purchase', customerId?: string | null, supplierId?: string | null, isQuickSale?: boolean): void {
    if (type === 'sale' && !customerId && !isQuickSale) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Satış için müşteri seçin');
    }
    if (type === 'sale' && !customerId) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Satış için müşteri seçin');
    }
    if (type === 'purchase' && !supplierId) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Alış için tedarikçi seçin');
    }
  }

  private async resolveLines(lines: SaleLineDto[]): Promise<SaleLine[]> {
    const resolved: SaleLine[] = [];
    for (const line of lines) {
      if (!(await this.products.findById(line.productId))) {
        throw new AppException(ErrorCode.FINANCE_INVALID, 'Seçilen ürün bulunamadı');
      }
      const tax = line.taxId ? await this.taxes.findById(line.taxId) : null;
      if (line.taxId && !tax) {
        throw new AppException(ErrorCode.FINANCE_INVALID, 'Seçilen KDV oranı bulunamadı');
      }
      resolved.push({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount ?? 0,
        taxId: line.taxId || null,
        taxRatio: tax?.ratio ?? 0,
        vatIncluded: line.vatIncluded !== false,
      });
    }
    return resolved;
  }

  private async withNames(items: Sale[]): Promise<SaleListItem[]> {
    const [customers, suppliers, methods, registers] = await Promise.all([
      this.customers.findByIds(items.map((item) => item.customerId).filter((id): id is string => Boolean(id))),
      this.suppliers.findByIds(items.map((item) => item.supplierId)),
      this.paymentMethods.findByIds(items.map((item) => item.paymentMethodId)),
      this.cashRegisters.findByIds(items.map((item) => item.cashRegisterId)),
    ]);
    return items.map((item) => {
      const customer = item.customerId ? customers.get(item.customerId) : undefined;
      const supplier = item.supplierId ? suppliers.get(item.supplierId) : undefined;
      return {
        ...item,
        partyName: customer
          ? `${customer.firstName} ${customer.lastName}`.trim()
          : (supplier?.name ?? ''),
        paymentMethodName: item.paymentMethodId ? (methods.get(item.paymentMethodId)?.name ?? '') : '',
        cashRegisterName: item.cashRegisterId ? (registers.get(item.cashRegisterId)?.name ?? '') : '',
      };
    });
  }
}

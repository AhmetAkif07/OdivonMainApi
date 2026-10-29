import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { CustomersRepository } from '../../customers/customers.repository';
import { ProductsRepository } from '../../definitions/products/products.repository';
import { TaxesRepository } from '../../definitions/taxes/taxes.repository';
import { priceDocument } from '../sale.totals';
import { SaleLineDto } from '../sales/sale.dto';
import { Sale, SaleLine } from '../sales/sale.entity';
import { SalesService } from '../sales/sales.service';
import {
  ConvertProformaDto,
  CreateProformaDto,
  ProformaQueryDto,
  SetProformaStatusDto,
  UpdateProformaDto,
} from './proforma.dto';
import { Proforma, ProformaListItem } from './proforma.entity';
import { ProformasRepository } from './proformas.repository';

@Injectable()
export class ProformasService {
  constructor(
    private readonly proformas: ProformasRepository,
    private readonly customers: CustomersRepository,
    private readonly products: ProductsRepository,
    private readonly taxes: TaxesRepository,
    private readonly sales: SalesService,
  ) {}

  async create(dto: CreateProformaDto): Promise<Proforma> {
    await this.assertCustomer(dto.customerId);
    const lines = await this.resolveLines(dto.lines);
    const discount = dto.discount ?? 0;
    return this.proformas.create({
      number: await this.nextNumber(dto.date),
      date: dto.date,
      validUntil: dto.validUntil || null,
      customerId: dto.customerId,
      patientId: dto.patientId || null,
      status: 'draft',
      discount,
      remark: dto.remark || null,
      lines,
      ...priceDocument(lines, discount),
      saleId: null,
    });
  }

  async update(id: string, dto: UpdateProformaDto): Promise<Proforma> {
    const current = await this.getEditable(id);
    if (dto.customerId) {
      await this.assertCustomer(dto.customerId);
    }
    const lines = dto.lines ? await this.resolveLines(dto.lines) : current.lines;
    const discount = dto.discount ?? current.discount;
    return this.proformas.save({
      ...current,
      date: dto.date ?? current.date,
      validUntil: dto.validUntil !== undefined ? dto.validUntil || null : current.validUntil,
      customerId: dto.customerId ?? current.customerId,
      patientId: dto.patientId !== undefined ? dto.patientId || null : current.patientId,
      remark: dto.remark !== undefined ? dto.remark || null : current.remark,
      discount,
      lines,
      ...priceDocument(lines, discount),
    });
  }

  async setStatus(id: string, dto: SetProformaStatusDto): Promise<Proforma> {
    const current = await this.getEditable(id);
    return this.proformas.save({ ...current, status: dto.status });
  }

  /** Turns the quote into a real sale, which then moves stock and shows on the till like any sale. */
  async convert(id: string, dto: ConvertProformaDto): Promise<{ proforma: Proforma; sale: Sale }> {
    const current = await this.getEditable(id);
    if (current.status === 'rejected') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Reddedilen proforma satışa çevrilemez');
    }
    const sale = await this.sales.create({
      type: 'sale',
      date: dto.date ?? new Date().toISOString(),
      customerId: current.customerId,
      paymentMethodId: dto.paymentMethodId || null,
      cashRegisterId: dto.cashRegisterId || null,
      discount: current.discount,
      remark: [`Proforma ${current.number}`, current.remark].filter(Boolean).join(' · '),
      lines: current.lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxId: line.taxId,
        vatIncluded: line.vatIncluded,
      })),
    });
    const proforma = await this.proformas.save({ ...current, status: 'converted', saleId: sale.id }, 'converted');
    return { proforma, sale };
  }

  get(id: string): Promise<Proforma> {
    return this.proformas.getByIdOrThrow(id);
  }

  async list(query: ProformaQueryDto): Promise<PaginatedResult<ProformaListItem>> {
    const items = (await this.proformas.collect()).filter(
      (item) =>
        (!query.status || item.status === query.status) && (!query.customerId || item.customerId === query.customerId),
    );
    const customers = await this.customers.findByIds([...new Set(items.map((item) => item.customerId))]);
    const today = new Date().toISOString().slice(0, 10);
    const enriched = items
      .map((item) => {
        const customer = customers.get(item.customerId);
        return {
          ...item,
          customerName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : '',
          expired:
            Boolean(item.validUntil) &&
            item.validUntil!.slice(0, 10) < today &&
            (item.status === 'draft' || item.status === 'sent'),
        };
      })
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(enriched, query.limit, query.cursor);
  }

  async remove(id: string): Promise<void> {
    await this.proformas.softDelete(await this.getEditable(id));
  }

  private async getEditable(id: string): Promise<Proforma> {
    const item = await this.proformas.getByIdOrThrow(id);
    if (item.status === 'converted') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Satışa çevrilmiş proforma değiştirilemez');
    }
    return item;
  }

  private async assertCustomer(id: string): Promise<void> {
    if (!(await this.customers.findById(id))) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Seçilen müşteri bulunamadı');
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

  /** PF-2026-0001 style, per year. */
  private async nextNumber(date: string): Promise<string> {
    const year = date.slice(0, 4);
    const prefix = `PF-${year}-`;
    const highest = (await this.proformas.collect())
      .map((item) => item.number)
      .filter((value) => value?.startsWith(prefix))
      .map((value) => Number(value.slice(prefix.length)) || 0)
      .reduce((max, value) => Math.max(max, value), 0);
    return `${prefix}${String(highest + 1).padStart(4, '0')}`;
  }
}

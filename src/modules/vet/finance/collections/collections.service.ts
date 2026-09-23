import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { CustomersRepository } from '../../customers/customers.repository';
import { CashRegistersRepository } from '../../definitions/cash-registers/cash-registers.repository';
import { PaymentMethodsRepository } from '../../definitions/payment-methods/payment-methods.repository';
import { SuppliersRepository } from '../../definitions/suppliers/suppliers.repository';
import { CreateCollectionDto, ListCollectionsQueryDto, UpdateCollectionDto } from './collection.dto';
import { Collection, CollectionKind, CollectionListItem } from './collection.entity';
import { CollectionsRepository } from './collections.repository';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly collections: CollectionsRepository,
    private readonly customers: CustomersRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly paymentMethods: PaymentMethodsRepository,
    private readonly cashRegisters: CashRegistersRepository,
  ) {}

  async create(dto: CreateCollectionDto): Promise<Collection> {
    this.assertParty(dto.kind, dto.customerId, dto.supplierId);
    return this.collections.create(dto);
  }

  getById(id: string): Promise<Collection> {
    return this.collections.getByIdOrThrow(id);
  }

  async list(query: ListCollectionsQueryDto): Promise<PaginatedResult<CollectionListItem>> {
    const items = (await this.withNames(await this.collections.collect()))
      .filter((item) => !query.kind || item.kind === query.kind)
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  async update(id: string, dto: UpdateCollectionDto): Promise<Collection> {
    const current = await this.collections.getByIdOrThrow(id);
    const kind = dto.kind ?? current.kind;
    const customerId = dto.customerId === undefined ? current.customerId : dto.customerId;
    const supplierId = dto.supplierId === undefined ? current.supplierId : dto.supplierId;
    this.assertParty(kind, customerId, supplierId);
    return this.collections.update(id, dto);
  }

  softDelete(id: string): Promise<void> {
    return this.collections.softDelete(id);
  }

  private assertParty(kind: CollectionKind, customerId?: string | null, supplierId?: string | null): void {
    if (kind === 'collection' && !customerId) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Tahsilat için müşteri seçin');
    }
    if (kind === 'payment' && !supplierId) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Ödeme için tedarikçi seçin');
    }
  }

  private async withNames(items: Collection[]): Promise<CollectionListItem[]> {
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
        partyName: customer ? `${customer.firstName} ${customer.lastName}`.trim() : (supplier?.name ?? ''),
        paymentMethodName: item.paymentMethodId ? (methods.get(item.paymentMethodId)?.name ?? '') : '',
        cashRegisterName: item.cashRegisterId ? (registers.get(item.cashRegisterId)?.name ?? '') : '',
      };
    });
  }
}

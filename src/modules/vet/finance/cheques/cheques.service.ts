import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CustomersRepository } from '../../customers/customers.repository';
import { SuppliersRepository } from '../../definitions/suppliers/suppliers.repository';
import { CollectionsService } from '../collections/collections.service';
import {
  ChangeChequeStatusDto,
  ChequeQueryDto,
  CreateChequeDto,
  PaymentCalendarQueryDto,
  UpdateChequeDto,
} from './cheque.dto';
import { CHEQUE_OPEN_STATUSES, CHEQUE_TRANSITIONS, Cheque, ChequeListItem } from './cheque.entity';
import { ChequesRepository } from './cheques.repository';

export interface PaymentCalendarDay {
  date: string;
  incoming: number;
  outgoing: number;
  items: ChequeListItem[];
}

export interface PaymentCalendar {
  from: string;
  to: string;
  totalIncoming: number;
  totalOutgoing: number;
  /** Open items whose due date is already before `from`. */
  overdueIncoming: number;
  overdueOutgoing: number;
  days: PaymentCalendarDay[];
}

const day = (value: string) => value.slice(0, 10);
const round2 = (value: number) => Math.round(value * 100) / 100;

@Injectable()
export class ChequesService {
  constructor(
    private readonly cheques: ChequesRepository,
    private readonly customers: CustomersRepository,
    private readonly suppliers: SuppliersRepository,
    private readonly collections: CollectionsService,
    private readonly tenantContext: TenantContext,
  ) {}

  async create(dto: CreateChequeDto): Promise<Cheque> {
    await this.assertParty(dto.direction, dto.customerId, dto.supplierId);
    const status = dto.direction === 'received' ? 'portfolio' : 'issued';
    return this.cheques.create({
      kind: dto.kind,
      direction: dto.direction,
      customerId: dto.direction === 'received' ? dto.customerId! : null,
      supplierId: dto.direction === 'issued' ? dto.supplierId! : null,
      amount: dto.amount,
      issueDate: dto.issueDate,
      dueDate: dto.dueDate,
      serialNo: dto.serialNo || null,
      bankName: dto.bankName || null,
      drawer: dto.drawer || null,
      endorsedTo: null,
      status,
      remark: dto.remark || null,
      collectionId: null,
      history: [{ status, at: new Date().toISOString(), by: this.tenantContext.getUserId(), remark: null }],
    });
  }

  async update(id: string, dto: UpdateChequeDto): Promise<Cheque> {
    const current = await this.cheques.getByIdOrThrow(id);
    if (!CHEQUE_OPEN_STATUSES.includes(current.status)) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Kapanmış çek / senet değiştirilemez');
    }
    const customerId = dto.customerId !== undefined ? dto.customerId : current.customerId;
    const supplierId = dto.supplierId !== undefined ? dto.supplierId : current.supplierId;
    await this.assertParty(current.direction, customerId, supplierId);
    return this.cheques.save({
      ...current,
      kind: dto.kind ?? current.kind,
      customerId: current.direction === 'received' ? customerId : null,
      supplierId: current.direction === 'issued' ? supplierId : null,
      amount: dto.amount ?? current.amount,
      issueDate: dto.issueDate ?? current.issueDate,
      dueDate: dto.dueDate ?? current.dueDate,
      serialNo: dto.serialNo !== undefined ? dto.serialNo || null : current.serialNo,
      bankName: dto.bankName !== undefined ? dto.bankName || null : current.bankName,
      drawer: dto.drawer !== undefined ? dto.drawer || null : current.drawer,
      remark: dto.remark !== undefined ? dto.remark || null : current.remark,
    });
  }

  /**
   * Moves the cheque through its life cycle. Settling (collected / paid) also writes a
   * collection or payment record so the owner's or supplier's balance and the till are updated.
   */
  async changeStatus(id: string, dto: ChangeChequeStatusDto): Promise<Cheque> {
    const current = await this.cheques.getByIdOrThrow(id);
    const allowed = CHEQUE_TRANSITIONS[current.direction][current.status] ?? [];
    if (!allowed.includes(dto.status)) {
      throw new AppException(ErrorCode.INVALID_STATUS, `Bu çek / senet "${current.status}" durumundan "${dto.status}" durumuna geçemez`);
    }
    if (dto.status === 'endorsed' && !dto.endorsedTo) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Ciro edilen kişi / firma girilmeli');
    }
    let collectionId = current.collectionId;
    if (dto.status === 'collected' || dto.status === 'paid') {
      const label = current.kind === 'cheque' ? 'Çek' : 'Senet';
      const collection = await this.collections.create({
        kind: current.direction === 'received' ? 'collection' : 'payment',
        date: dto.date ?? new Date().toISOString(),
        customerId: current.customerId,
        supplierId: current.supplierId,
        amount: current.amount,
        paymentMethodId: dto.paymentMethodId || null,
        cashRegisterId: dto.cashRegisterId || null,
        remark: [`${label} ${current.serialNo ?? ''}`.trim(), dto.remark].filter(Boolean).join(' · '),
      });
      collectionId = collection.id;
    }
    return this.cheques.save({
      ...current,
      status: dto.status,
      endorsedTo: dto.status === 'endorsed' ? dto.endorsedTo! : current.endorsedTo,
      collectionId,
      history: [
        ...current.history,
        { status: dto.status, at: new Date().toISOString(), by: this.tenantContext.getUserId(), remark: dto.remark || null },
      ],
    });
  }

  get(id: string): Promise<Cheque> {
    return this.cheques.getByIdOrThrow(id);
  }

  async list(query: ChequeQueryDto): Promise<PaginatedResult<ChequeListItem>> {
    const items = (await this.withNames(await this.cheques.collect()))
      .filter((item) => (!query.direction || item.direction === query.direction) && (!query.status || item.status === query.status))
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(items, query.limit, query.cursor);
  }

  /** Open cheques and notes grouped by due day, with incoming/outgoing totals. */
  async calendar(query: PaymentCalendarQueryDto): Promise<PaymentCalendar> {
    const from = day(query.from);
    const to = day(query.to);
    if (from > to) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Başlangıç tarihi bitişten sonra olamaz');
    }
    const open = (await this.withNames(await this.cheques.collect())).filter((item) =>
      CHEQUE_OPEN_STATUSES.includes(item.status),
    );
    const days = new Map<string, PaymentCalendarDay>();
    let overdueIncoming = 0;
    let overdueOutgoing = 0;
    for (const item of open) {
      const due = day(item.dueDate);
      if (due < from) {
        if (item.direction === 'received') overdueIncoming += item.amount;
        else overdueOutgoing += item.amount;
        continue;
      }
      if (due > to) {
        continue;
      }
      const entry = days.get(due) ?? { date: due, incoming: 0, outgoing: 0, items: [] };
      if (item.direction === 'received') entry.incoming += item.amount;
      else entry.outgoing += item.amount;
      entry.items.push(item);
      days.set(due, entry);
    }
    const list = [...days.values()]
      .map((entry) => ({ ...entry, incoming: round2(entry.incoming), outgoing: round2(entry.outgoing) }))
      .sort((left, right) => left.date.localeCompare(right.date));
    return {
      from,
      to,
      totalIncoming: round2(list.reduce((sum, entry) => sum + entry.incoming, 0)),
      totalOutgoing: round2(list.reduce((sum, entry) => sum + entry.outgoing, 0)),
      overdueIncoming: round2(overdueIncoming),
      overdueOutgoing: round2(overdueOutgoing),
      days: list,
    };
  }

  async remove(id: string): Promise<void> {
    const current = await this.cheques.getByIdOrThrow(id);
    if (current.collectionId) {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Tahsil / ödeme kaydı oluşmuş çek / senet silinemez');
    }
    await this.cheques.softDelete(current);
  }

  private async assertParty(direction: Cheque['direction'], customerId?: string | null, supplierId?: string | null) {
    if (direction === 'received') {
      if (!customerId || !(await this.customers.findById(customerId))) {
        throw new AppException(ErrorCode.FINANCE_INVALID, 'Alınan çek / senet için müşteri seçilmeli');
      }
    } else if (!supplierId || !(await this.suppliers.findById(supplierId))) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Verilen çek / senet için tedarikçi seçilmeli');
    }
  }

  private async withNames(items: Cheque[]): Promise<ChequeListItem[]> {
    const [customers, suppliers] = await Promise.all([
      this.customers.findByIds([...new Set(items.map((item) => item.customerId).filter((id): id is string => Boolean(id)))]),
      this.suppliers.findByIds(items.map((item) => item.supplierId)),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    return items.map((item) => {
      const customer = item.customerId ? customers.get(item.customerId) : undefined;
      return {
        ...item,
        partyName: customer
          ? `${customer.firstName} ${customer.lastName}`.trim()
          : item.supplierId
            ? (suppliers.get(item.supplierId)?.name ?? '')
            : '',
        overdue: CHEQUE_OPEN_STATUSES.includes(item.status) && day(item.dueDate) < today,
      };
    });
  }
}

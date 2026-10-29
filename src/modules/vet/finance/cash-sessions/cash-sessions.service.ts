import { Injectable } from '@nestjs/common';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { matchesColumnFilters } from '../../../../shared/http/column-filters';
import { paginateInMemory } from '../../../../shared/http/paginate-memory';
import { PaginatedResult } from '../../../../shared/http/paginated.result';
import { CashRegistersRepository } from '../../definitions/cash-registers/cash-registers.repository';
import { PaymentMethodsRepository } from '../../definitions/payment-methods/payment-methods.repository';
import { CashMovementsRepository } from '../cash-movements/cash-movements.repository';
import { CollectionsRepository } from '../collections/collections.repository';
import { SalesRepository } from '../sales/sales.repository';
import { CashSessionQueryDto, CloseCashSessionDto, OpenCashSessionDto } from './cash-session.dto';
import { CashSession, CashSessionListItem, CashSessionSummary } from './cash-session.entity';
import { buildCashSessionSummary } from './cash-session.summary';
import { CashSessionsRepository } from './cash-sessions.repository';

export interface CashSessionReport extends CashSessionListItem {
  /** Live totals for an open session (X report), frozen totals for a closed one (Z report). */
  report: CashSessionSummary;
}

@Injectable()
export class CashSessionsService {
  constructor(
    private readonly sessions: CashSessionsRepository,
    private readonly cashRegisters: CashRegistersRepository,
    private readonly paymentMethods: PaymentMethodsRepository,
    private readonly sales: SalesRepository,
    private readonly collections: CollectionsRepository,
    private readonly movements: CashMovementsRepository,
  ) {}

  async open(dto: OpenCashSessionDto): Promise<CashSession> {
    const register = await this.cashRegisters.findById(dto.cashRegisterId);
    if (!register) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'Seçilen kasa bulunamadı');
    }
    if (await this.sessions.findOpen(dto.cashRegisterId)) {
      throw new AppException(ErrorCode.CASH_SESSION_CONFLICT, `${register.name} zaten açık, önce kapatın`);
    }
    return this.sessions.open({
      cashRegisterId: dto.cashRegisterId,
      openingAmount: dto.openingAmount,
      remark: dto.remark || null,
    });
  }

  async close(id: string, dto: CloseCashSessionDto): Promise<CashSessionReport> {
    const current = await this.sessions.getByIdOrThrow(id);
    if (current.status !== 'open') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Bu kasa oturumu zaten kapatılmış');
    }
    const closedAt = new Date().toISOString();
    const summary = await this.computeSummary(current, closedAt);
    const closed = await this.sessions.close(current, {
      countedAmount: dto.countedAmount,
      remark: dto.remark || null,
      summary,
      closedAt,
    });
    return this.withRegister(closed, summary);
  }

  async current(cashRegisterId: string): Promise<CashSessionReport | null> {
    const session = await this.sessions.findOpen(cashRegisterId);
    if (!session) {
      return null;
    }
    return this.withRegister(session, await this.computeSummary(session, new Date().toISOString()));
  }

  async report(id: string): Promise<CashSessionReport> {
    const session = await this.sessions.getByIdOrThrow(id);
    const summary = session.summary ?? (await this.computeSummary(session, new Date().toISOString()));
    return this.withRegister(session, summary);
  }

  async list(query: CashSessionQueryDto): Promise<PaginatedResult<CashSessionListItem>> {
    const items = (await this.sessions.collect()).filter(
      (item) =>
        (!query.cashRegisterId || item.cashRegisterId === query.cashRegisterId) &&
        (!query.status || item.status === query.status),
    );
    const registers = await this.cashRegisters.findByIds(items.map((item) => item.cashRegisterId));
    const enriched = items
      .map((item) => ({ ...item, cashRegisterName: registers.get(item.cashRegisterId)?.name ?? '' }))
      .filter((item) => matchesColumnFilters(item, query.filters));
    return paginateInMemory(enriched, query.limit, query.cursor);
  }

  private async computeSummary(session: CashSession, to: string): Promise<CashSessionSummary> {
    const [sales, collections, movements, methods] = await Promise.all([
      this.sales.collect(),
      this.collections.collect(),
      this.movements.collect(),
      this.paymentMethods.collect(),
    ]);
    return buildCashSessionSummary({
      cashRegisterId: session.cashRegisterId,
      openingAmount: session.openingAmount,
      from: session.openedAt,
      to,
      sales,
      collections,
      movements,
      paymentMethodNames: new Map(methods.map((item) => [item.id, item.name])),
    });
  }

  private async withRegister(session: CashSession, report: CashSessionSummary): Promise<CashSessionReport> {
    const register = await this.cashRegisters.findById(session.cashRegisterId);
    return { ...session, cashRegisterName: register?.name ?? '', report };
  }
}

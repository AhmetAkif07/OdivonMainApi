import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { isDeleted } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { isOpenAccountMethod } from '../finance/cash-sessions/cash-session.summary';
import { StockLedgerService } from '../stock/stock-ledger.service';
import {
  addDaysToDate,
  AppointmentInput,
  buildDayEnd,
  CashSessionInput,
  ChequeInput,
  CollectionInput,
  CustomerInput,
  DayEndReport,
  DEFAULT_UTC_OFFSET_MINUTES,
  localDay,
  receivableBalances,
  SaleInput,
} from './day-end.logic';

type Doc = Record<string, unknown> & { deletedAt?: string | null };

/** Loads the day's records and hands them to the pure day-end analysis. */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly ledger: StockLedgerService,
  ) {}

  private col(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), name));
  }

  private async all<T>(name: string): Promise<T[]> {
    const snapshot = await this.col(name).get();
    return snapshot.docs.map((doc) => doc.data() as Doc).filter((item) => !isDeleted(item)) as unknown as T[];
  }

  /** Range query on one field; falls back to a full read if the query fails. */
  private async since<T>(name: string, field: string, from: string): Promise<T[]> {
    try {
      const snapshot = await this.col(name).where(field, '>=', from).get();
      return snapshot.docs.map((doc) => doc.data() as Doc).filter((item) => !isDeleted(item)) as unknown as T[];
    } catch (error) {
      this.logger.warn(`Range query on ${name}.${field} failed, reading all: ${String(error)}`);
      return (await this.all<Doc>(name)).filter((item) => String(item[field] ?? '') >= from) as unknown as T[];
    }
  }

  async dayEnd(date?: string, utcOffsetMinutes = DEFAULT_UTC_OFFSET_MINUTES): Promise<DayEndReport> {
    const now = new Date();
    const day = date?.slice(0, 10) || localDay(now.toISOString(), utcOffsetMinutes)!;
    // Nine days back covers the 7-day average plus the time-zone edge.
    const from = addDaysToDate(day, -9);

    const [sales, collections, appointments, customers, cashSessions, cheques, paymentMethods, stock] = await Promise.all([
      this.all<SaleInput>(TENANT_COLLECTION.sales),
      this.all<CollectionInput>(TENANT_COLLECTION.collections),
      this.since<AppointmentInput>(TENANT_COLLECTION.appointments, 'beginAt', from),
      this.since<CustomerInput>(TENANT_COLLECTION.customers, 'createdAt', addDaysToDate(day, -1)),
      this.all<CashSessionInput>(TENANT_COLLECTION.cashSessions),
      this.all<ChequeInput>(TENANT_COLLECTION.cheques),
      this.all<{ id: string; name?: string }>(TENANT_COLLECTION.paymentMethods),
      this.ledger.allBalances().catch((error) => {
        this.logger.warn(`Stock balances unavailable: ${String(error)}`);
        return [];
      }),
    ]);

    const creditMethods = new Set(
      paymentMethods.filter((method) => isOpenAccountMethod(method.id, method.name ?? '')).map((method) => method.id),
    );
    const input = { date: day, utcOffsetMinutes, now, sales, collections, creditMethods };
    const customerNames = await this.namesOf(receivableBalances(input).slice(0, 3).map(([id]) => id));

    return buildDayEnd({ ...input, appointments, customers, cashSessions, cheques, stock, customerNames });
  }

  private async namesOf(ids: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    const snapshots = await Promise.all(ids.map((id) => this.col(TENANT_COLLECTION.customers).doc(id).get()));
    for (const snapshot of snapshots) {
      const data = snapshot.exists ? (snapshot.data() as { firstName?: string; lastName?: string }) : null;
      if (data) names.set(snapshot.id, `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim());
    }
    return names;
  }
}

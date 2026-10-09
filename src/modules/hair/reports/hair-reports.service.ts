import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { addDays } from '../shared/appointment-plan';
import { summarizeCash } from '../shared/cash-register';
import { hairInvalid } from '../shared/hair-errors';
import { PaymentLine, round2 } from '../shared/hair-money';
import { HairActor, HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { num, str } from '../shared/hair-tx';
import { HairReportQueryDto } from './report.dto';

const DEFAULT_RANGE_DAYS = 30;
const DASHBOARD_TREND_DAYS = 14;
const MAX_RANGE_DAYS = 366;

interface ReportScope {
  actor: HairActor;
  /** Only this staff member's figures (stylists, `own`). */
  staffId?: string;
  /** Strip cost / profit figures (`limited`). */
  limited: boolean;
  /** Branch filter: one branch or the caller's branches (null = all). */
  branches: string[] | null;
}

interface SessionItem {
  type: string;
  refId: string;
  name: string;
  lineTotal: number;
  staffId?: string | null;
}

/** Reports (plan §4.10) and the dashboard. Figures are computed in memory from the day-ranged rows. */
@Injectable()
export class HairReportsService {
  constructor(private readonly store: HairStore) {}

  // ── Dashboard ──

  async dashboard(query: HairReportQueryDto) {
    const scope = await this.scope(query, 'hairDashboard');
    const today = dateIdInTz(await this.store.timeZone());
    const from = addDays(today, -(DASHBOARD_TREND_DAYS - 1));
    const [payments, sessions, appointments, customers, commissions] = await Promise.all([
      this.byDate(TENANT_COLLECTION.hairPayments, from, today, scope),
      this.byDate(TENANT_COLLECTION.hairSessions, from, today, scope),
      this.store.rows(TENANT_COLLECTION.hairAppointments, undefined, { field: 'date', from, to: addDays(today, 61) }),
      scope.staffId ? Promise.resolve([] as HairDoc[]) : this.store.rows(TENANT_COLLECTION.hairCustomers),
      this.byDate(TENANT_COLLECTION.hairCommissions, from, today, scope),
    ]);
    const scopedAppointments = appointments.filter((a) => this.inScope(a, scope));
    const todays = scopedAppointments.filter((a) => a['date'] === today && a['status'] !== 'cancelled');
    const pastWindow = scopedAppointments.filter((a) => str(a['date']) <= today);

    const revenueByDay = scope.staffId
      ? sumBy(sessions.flatMap((s) => staffLines(s, scope.staffId!)), (l) => l.date, (l) => l.amount)
      : sumBy(payments, (p) => str(p['date']), (p) => num(p['totalAmount']));
    const recentPool = await this.store.list(TENANT_COLLECTION.hairAppointments, {
      orderBy: { field: 'createdAt', dir: 'desc' },
      match: (a) => this.inScope(a, scope),
      limit: 5,
    });

    return {
      todayRevenue: round2(revenueByDay.get(today) ?? 0),
      todayAppointments: todays.length,
      totalCustomers: scope.staffId
        ? new Set(scopedAppointments.map((a) => str(a['customerId']))).size
        : customers.filter((c) => c['active'] !== false).length,
      pendingAppointments: scopedAppointments.filter((a) => a['status'] === 'pending' && str(a['date']) >= today).length,
      revenueTrend: days(from, today).map((date) => ({ date, amount: round2(revenueByDay.get(date) ?? 0) })),
      staffPerformance: this.staffPerformanceRows(sessions, pastWindow, commissions, scope).map(
        ({ staffId, staffName, revenue, appointments: count }) => ({ staffId, staffName, revenue, appointments: count }),
      ),
      recentAppointments: recentPool.items,
    };
  }

  // ── Reports ──

  async daily(query: HairReportQueryDto) {
    const scope = await this.scope(query, 'hairReports');
    const date = query.date ?? dateIdInTz(await this.store.timeZone());
    const [payments, expenses, appointments, sessions] = await Promise.all([
      this.byDate(TENANT_COLLECTION.hairPayments, date, date, scope),
      this.byDate(TENANT_COLLECTION.hairExpenses, date, date, scope),
      this.byDate(TENANT_COLLECTION.hairAppointments, date, date, scope),
      this.byDate(TENANT_COLLECTION.hairSessions, date, date, scope),
    ]);
    const scopedAppointments = appointments.filter((a) => this.inScope(a, scope));
    const revenue = scope.staffId
      ? round2(sessions.flatMap((s) => staffLines(s, scope.staffId!)).reduce((sum, l) => sum + l.amount, 0))
      : round2(payments.reduce((sum, p) => sum + num(p['totalAmount']), 0));
    const expenseTotal = round2(expenses.reduce((sum, e) => sum + num(e['amount']), 0));
    const cash = summarizeCash({ openingBalance: 0, payments: payments as { lines?: PaymentLine[] }[], expenses: [] });
    const report = {
      date,
      revenue,
      expenses: expenseTotal,
      net: round2(revenue - expenseTotal),
      appointments: scopedAppointments.filter((a) => a['status'] !== 'cancelled').length,
      completedAppointments: scopedAppointments.filter((a) => a['status'] === 'completed').length,
      cancelledAppointments: scopedAppointments.filter((a) => a['status'] === 'cancelled').length,
      noShowAppointments: scopedAppointments.filter((a) => a['status'] === 'noShow').length,
      byPaymentMethod: scope.staffId ? [] : cash.byPaymentMethod,
    };
    if (scope.staffId || scope.limited) {
      return { ...report, expenses: null, net: null };
    }
    return report;
  }

  async revenue(query: HairReportQueryDto) {
    const scope = await this.scope(query, 'hairReports');
    const { from, to } = await this.range(query);
    const [payments, sessions, services, categories] = await Promise.all([
      this.byDate(TENANT_COLLECTION.hairPayments, from, to, scope),
      this.byDate(TENANT_COLLECTION.hairSessions, from, to, scope),
      this.store.rows(TENANT_COLLECTION.hairServices),
      this.store.rows(TENANT_COLLECTION.hairServiceCategories),
    ]);
    const lines = scope.staffId
      ? sessions.flatMap((s) => staffLines(s, scope.staffId!))
      : sessions.flatMap((s) => allLines(s));
    const byDay = scope.staffId
      ? sumBy(lines, (l) => l.date, (l) => l.amount)
      : sumBy(payments, (p) => str(p['date']), (p) => num(p['totalAmount']));
    const serviceCategory = new Map(services.map((s) => [s.id, str(s['categoryId'])]));
    const categoryName = new Map(categories.map((c) => [c.id, str(c['name'])]));
    const byCategory = new Map<string, { categoryId: string; categoryName: string; amount: number }>();
    for (const line of lines) {
      const categoryId =
        line.type === 'service' ? serviceCategory.get(line.refId) || 'uncategorized' : line.type === 'product' ? 'products' : 'packages';
      const name =
        categoryId === 'products' ? 'Ürün satışı' : categoryId === 'packages' ? 'Paket satışı' : categoryName.get(categoryId) ?? 'Diğer';
      const entry = byCategory.get(categoryId) ?? { categoryId, categoryName: name, amount: 0 };
      entry.amount = round2(entry.amount + line.amount);
      byCategory.set(categoryId, entry);
    }
    const trend = days(from, to).map((date) => ({ date, amount: round2(byDay.get(date) ?? 0) }));
    return {
      from,
      to,
      total: round2(trend.reduce((sum, d) => sum + d.amount, 0)),
      trend,
      byCategory: [...byCategory.values()].sort((a, b) => b.amount - a.amount),
    };
  }

  async staffPerformance(query: HairReportQueryDto) {
    const scope = await this.scope(query, 'hairReports');
    const { from, to } = await this.range(query);
    const [sessions, appointments, commissions] = await Promise.all([
      this.byDate(TENANT_COLLECTION.hairSessions, from, to, scope),
      this.byDate(TENANT_COLLECTION.hairAppointments, from, to, scope),
      this.byDate(TENANT_COLLECTION.hairCommissions, from, to, scope),
    ]);
    const rows = this.staffPerformanceRows(sessions, appointments.filter((a) => this.inScope(a, scope)), commissions, scope);
    return scope.limited ? rows.map((row) => ({ ...row, commission: null })) : rows;
  }

  async inventory(query: HairReportQueryDto) {
    const scope = await this.scope(query, 'hairReports');
    const products = await this.store.rows(TENANT_COLLECTION.hairProducts);
    return products
      .filter((p) => !scope.branches || !p['branchId'] || scope.branches.includes(str(p['branchId'])))
      .map((p) => ({
        productId: p.id,
        name: str(p['name']),
        category: str(p['category']),
        unit: str(p['unit']),
        currentStock: num(p['currentStock']),
        minStock: num(p['minStock']),
        low: num(p['currentStock']) <= num(p['minStock']),
        stockValue: scope.limited || scope.staffId ? null : round2(num(p['currentStock']) * num(p['purchasePrice'])),
        active: p['active'] !== false,
      }))
      .sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name, 'tr'));
  }

  /** Visit recency buckets and the customers due for a re-engagement message (N-003). */
  async customerRetention(query: HairReportQueryDto) {
    await this.scope(query, 'hairReports');
    const settings = await this.store.settings();
    const today = dateIdInTz(settings.timezone);
    const { from, to } = await this.range(query);
    const customers = (await this.store.rows(TENANT_COLLECTION.hairCustomers)).filter((c) => c['active'] !== false);
    const since = (daysBack: number) => addDays(today, -daysBack);
    const visitedSince = (date: string) => customers.filter((c) => str(c['lastVisitDate']) >= date).length;
    const lapseDate = since(settings.reengagementDays);
    const lapsed = customers.filter((c) => str(c['lastVisitDate']) && str(c['lastVisitDate']) < lapseDate);
    const created = customers.filter((c) => str(c.createdAt).slice(0, 10) >= from && str(c.createdAt).slice(0, 10) <= to);
    return {
      from,
      to,
      totalCustomers: customers.length,
      newCustomers: created.length,
      visitedLast30: visitedSince(since(30)),
      visitedLast60: visitedSince(since(60)),
      visitedLast90: visitedSince(since(90)),
      neverVisited: customers.filter((c) => !str(c['lastVisitDate'])).length,
      reengagementDays: settings.reengagementDays,
      lapsedCount: lapsed.length,
      lapsed: lapsed
        .sort((a, b) => str(a['lastVisitDate']).localeCompare(str(b['lastVisitDate'])))
        .slice(0, 100)
        .map((c) => ({
          customerId: c.id,
          name: `${str(c['firstName'])} ${str(c['lastName'])}`.trim(),
          phone: str(c['phone']),
          lastVisitDate: str(c['lastVisitDate']),
          totalVisits: num(c['totalVisits']),
          consentCommercialIys: c['consentCommercialIys'] === true,
        })),
    };
  }

  // ── helpers ──

  staffPerformanceRows(sessions: HairDoc[], appointments: HairDoc[], commissions: HairDoc[], scope: ReportScope) {
    const rows = new Map<string, { staffId: string; staffName: string; appointments: number; revenue: number; commission: number }>();
    const row = (staffId: string, staffName: string) => {
      const existing = rows.get(staffId) ?? { staffId, staffName, appointments: 0, revenue: 0, commission: 0 };
      if (!existing.staffName && staffName) existing.staffName = staffName;
      rows.set(staffId, existing);
      return existing;
    };
    for (const session of sessions) {
      for (const line of allLines(session)) {
        const staffId = line.staffId ?? str(session['staffId']);
        if (!staffId || (scope.staffId && staffId !== scope.staffId)) continue;
        const entry = row(staffId, staffId === session['staffId'] ? str(session['staffName']) : '');
        entry.revenue = round2(entry.revenue + line.amount);
      }
    }
    for (const appointment of appointments) {
      if (appointment['status'] !== 'completed') continue;
      const staffId = str(appointment['staffId']);
      if (scope.staffId && staffId !== scope.staffId) continue;
      row(staffId, str(appointment['staffName'])).appointments += 1;
    }
    for (const commission of commissions) {
      const staffId = str(commission['staffId']);
      if (scope.staffId && staffId !== scope.staffId) continue;
      const entry = row(staffId, str(commission['staffName']));
      entry.commission = round2(entry.commission + num(commission['amount']));
    }
    return [...rows.values()].sort((a, b) => b.revenue - a.revenue);
  }

  private async scope(query: HairReportQueryDto, resource: 'hairReports' | 'hairDashboard'): Promise<ReportScope> {
    const actor = await this.store.actorOrThrow();
    const staffId = this.store.staffFilter(actor, resource, query.staffId);
    const branch = this.store.branchFilter(actor, query.branchId);
    return {
      actor,
      staffId,
      limited: this.store.scope(actor, resource) === 'limited',
      branches: branch.equals ? [branch.equals] : (branch.anyOf ?? null),
    };
  }

  private async range(query: HairReportQueryDto) {
    const to = query.to ?? dateIdInTz(await this.store.timeZone());
    const from = query.from ?? addDays(to, -(DEFAULT_RANGE_DAYS - 1));
    if (from > to) throw hairInvalid('Başlangıç tarihi bitişten sonra olamaz.');
    if (days(from, to).length > MAX_RANGE_DAYS) throw hairInvalid('Rapor aralığı en fazla bir yıl olabilir.');
    return { from, to };
  }

  /** Rows with `from <= date <= to` (local day ids) in the scope's branches. */
  private async byDate(collection: string, from: string, to: string, scope: ReportScope) {
    const rows = await this.store.rows(collection, undefined, { field: 'date', from, to: addDays(to, 1) });
    return rows.filter((row) => !scope.branches || !row['branchId'] || scope.branches.includes(str(row['branchId'])));
  }

  inScope(row: HairDoc, scope: ReportScope): boolean {
    if (scope.branches && row['branchId'] && !scope.branches.includes(str(row['branchId']))) return false;
    if (!scope.staffId) return true;
    if (row['staffId'] === scope.staffId) return true;
    return Array.isArray(row['services']) && (row['services'] as HairDoc[]).some((s) => s['staffId'] === scope.staffId);
  }
}

/** Charged session lines, scaled by the session's global discount so they add up to `totalAmount`. */
function allLines(session: HairDoc): (SessionItem & { amount: number; date: string })[] {
  const items = Array.isArray(session['items']) ? (session['items'] as SessionItem[]) : [];
  const subtotal = num(session['subtotal'], items.reduce((sum, item) => sum + num(item.lineTotal), 0));
  const net = num(session['totalAmount']) - num(session['refundedAmount']);
  const factor = subtotal > 0 ? net / subtotal : 0;
  return items.map((item) => ({ ...item, amount: round2(num(item.lineTotal) * factor), date: str(session['date']) }));
}

function staffLines(session: HairDoc, staffId: string) {
  return allLines(session).filter((line) => (line.staffId ?? session['staffId']) === staffId);
}

function sumBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) totals.set(key(row), (totals.get(key(row)) ?? 0) + value(row));
  return totals;
}

function days(from: string, to: string): string[] {
  const result: string[] = [];
  for (let date = from; date <= to && result.length <= MAX_RANGE_DAYS; date = addDays(date, 1)) result.push(date);
  return result;
}

import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BranchesRepository } from '../branches/branches.repository';
import { MembersRepository } from '../members/members.repository';
import { gymToday } from '../ops/receivables.math';
import { GymStore } from '../shared/gym-store';
import { AccessEvent, ChurnMember, churnByMonth, hourlyOccupancy, lastMonths, occupancyNow } from './reports.math';
import { buildBranchReport, ReportBranch, ReportEntry, ReportMember } from './branch-report.math';
import {
  checkInsByDay,
  financeByMonth,
  lastDays,
  memberStatus,
  salesByDay,
  SummaryEntry,
  SummaryMember,
  SummarySale,
} from './dashboard-summary.math';
import { hasPermission, PermissionResource } from '../../../shared/authorization/permissions';
import { TenantStore } from '../../../shared/tenancy/tenant.context';

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 92;
const MAX_BRANCH_REPORT_DAYS = 366;
const TREND_MONTHS = 6;
/** Istanbul has no DST since 2016: a gym-local day starts at 21:00 UTC the previous day. */
const dayStart = (day: string) => new Date(`${day}T00:00:00+03:00`).toISOString();
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

@Injectable()
export class GymReportsService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly branches: BranchesRepository,
  ) {}

  /** People in the gym now, from today's turnstile events (no sample data). */
  async occupancyNow(now = new Date()) {
    const today = gymToday(now);
    const events = await this.events(dayStart(today), now.toISOString());
    const capacity = (await this.branches.list())
      .filter((b) => b.status === 'active')
      .reduce((sum, b) => sum + (Number(b.capacity) || 0), 0);
    return { ...occupancyNow(events, now), capacity: capacity || null, day: today, asOf: now.toISOString() };
  }

  /** Average entries per weekday × hour (default: the last 28 days). */
  async hourly(from?: string, to?: string) {
    const end = to ?? gymToday();
    const start = from ?? addDays(end, -27);
    const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
    if (span < 0 || span >= MAX_RANGE_DAYS) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Date range must be 1-${MAX_RANGE_DAYS} days`);
    }
    const events = await this.events(dayStart(start), dayStart(addDays(end, 1)));
    return hourlyOccupancy(events, start, end);
  }

  /** Monthly churn for the last `months` months, with the members who did not renew. */
  async churn(months = 6) {
    const members = (await this.members.list({})) as unknown as ChurnMember[];
    return churnByMonth(members, lastMonths(gymToday(), months), new Date());
  }

  /**
   * Consolidated report across branches for `from`..`to` (default: this month so far), with the
   * revenue of the last 6 months per branch.
   */
  async branchReport(from?: string, to?: string, now = new Date()) {
    const today = gymToday(now);
    const end = to ?? today;
    const start = from ?? `${end.slice(0, 7)}-01`;
    const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
    if (span < 0 || span >= MAX_BRANCH_REPORT_DAYS) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Date range must be 1-${MAX_BRANCH_REPORT_DAYS} days`);
    }
    const [branches, members, entries, events] = await Promise.all([
      this.branches.list(),
      this.members.list({}),
      this.store.list(TENANT_COLLECTION.gymAccountingEntries),
      this.events(dayStart(start), dayStart(addDays(end, 1))),
    ]);
    return buildBranchReport({
      branches: branches as unknown as ReportBranch[],
      members: members as unknown as ReportMember[],
      entries: entries as unknown as ReportEntry[],
      events,
      from: start,
      to: end,
      months: lastMonths(today, TREND_MONTHS),
      now,
    });
  }

  /**
   * Home-page charts for staff. Each section is filled only when the caller may view that data
   * (the same permission as its list endpoint), otherwise it is null; nothing here needs reports.
   */
  async dashboard(user: TenantStore, now = new Date()) {
    const can = (resource: PermissionResource) => user.role === 'owner' || hasPermission(user.permissions, resource, 'view');
    const today = gymToday(now);
    const days = lastDays(today, 7);
    const months = lastMonths(today, 6);
    const [events, sales, members, entries] = await Promise.all([
      can('accessControl') ? this.events(dayStart(days[0]), now.toISOString()) : null,
      can('shop') ? this.store.list(TENANT_COLLECTION.gymShopSales) : null,
      can('members') ? this.members.list({}) : null,
      can('accounting') ? this.store.list(TENANT_COLLECTION.gymAccountingEntries) : null,
    ]);
    return {
      days,
      months,
      checkIns: events ? checkInsByDay(events, days) : null,
      sales: sales ? salesByDay(sales as unknown as SummarySale[], days) : null,
      members: members ? memberStatus(members as unknown as SummaryMember[], now) : null,
      finance: entries ? financeByMonth(entries as unknown as SummaryEntry[], months) : null,
    };
  }

  private async events(fromIso: string, toIso: string): Promise<AccessEvent[]> {
    const snapshot = await this.store
      .collection(TENANT_COLLECTION.gymAccessLogs)
      .where('createdAt', '>=', fromIso)
      .where('createdAt', '<', toIso)
      .get();
    return snapshot.docs.map((doc) => doc.data() as AccessEvent);
  }
}

import { safeDay } from './dashboard-summary.math';
import { AccessEvent, eventTime } from './reports.math';

/** Row key for records that cannot be tied to a branch (no branch on the record or its member). */
export const UNASSIGNED = 'unassigned';

export interface ReportBranch {
  id: string;
  name: string;
  capacity?: number | null;
  status?: string | null;
}

export interface ReportMember {
  uid: string;
  branchId?: string | null;
  membershipStatus?: string | null;
  membershipEndsAt?: string | null;
  createdAt?: string | null;
  isArchived?: boolean | null;
}

export interface ReportEntry {
  type?: string | null;
  amount?: number | string | null;
  entryDate?: string | null;
  createdAt?: string | null;
  branchId?: string | null;
  userId?: string | null;
}

export interface BranchReportRow {
  branchId: string;
  branchName: string;
  capacity: number | null;
  totalMembers: number;
  activeMembers: number;
  newMembers: number;
  revenue: number;
  expense: number;
  net: number;
  checkIns: number;
  avgDailyCheckIns: number;
  revenuePerActiveMember: number;
  revenueShare: number;
}

export interface BranchReport {
  from: string;
  to: string;
  days: number;
  rows: BranchReportRow[];
  totals: Omit<BranchReportRow, 'branchId' | 'branchName' | 'capacity' | 'revenueShare'> & { capacity: number | null };
  /** Revenue per month per branch (keys: branch ids, plus `unassigned`). */
  monthly: { month: string; revenue: Record<string, number> }[];
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round1 = (value: number) => Math.round(value * 10) / 10;
const amountOf = (entry: ReportEntry) => {
  const value = Number(entry.amount ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
const dayOf = (entry: ReportEntry) => safeDay(entry.entryDate || entry.createdAt);
const passedIn = (event: AccessEvent) => (event.status === 'granted' || event.status === 'unknown') && event.direction !== 'out';

function isActive(member: ReportMember, now: Date): boolean {
  if (member.membershipStatus !== 'active') return false;
  if (!member.membershipEndsAt) return true;
  const end = Date.parse(member.membershipEndsAt);
  return Number.isNaN(end) || end >= now.getTime();
}

/**
 * Consolidated multi-branch report for the gym-local days `from`..`to` (inclusive). A record
 * belongs to its own `branchId`, else to its member's branch, else to "unassigned"; nothing is
 * dropped, so the branch rows always add up to the totals.
 */
export function buildBranchReport(input: {
  branches: ReportBranch[];
  members: ReportMember[];
  entries: ReportEntry[];
  events: AccessEvent[];
  from: string;
  to: string;
  months: string[];
  now?: Date;
}): BranchReport {
  const now = input.now ?? new Date();
  const known = new Set(input.branches.map((branch) => branch.id));
  const memberBranch = new Map(input.members.map((member) => [member.uid, member.branchId ?? null]));
  const branchOf = (branchId?: string | null, userId?: string | null) => {
    const own = branchId && known.has(branchId) ? branchId : null;
    if (own) return own;
    const viaMember = userId ? memberBranch.get(userId) : null;
    return viaMember && known.has(viaMember) ? viaMember : UNASSIGNED;
  };

  const rows = new Map<string, BranchReportRow>();
  const row = (id: string): BranchReportRow => {
    let current = rows.get(id);
    if (!current) {
      const branch = input.branches.find((item) => item.id === id);
      current = {
        branchId: id,
        branchName: branch?.name ?? 'Şubesi belirsiz',
        capacity: branch?.capacity ? Number(branch.capacity) : null,
        totalMembers: 0,
        activeMembers: 0,
        newMembers: 0,
        revenue: 0,
        expense: 0,
        net: 0,
        checkIns: 0,
        avgDailyCheckIns: 0,
        revenuePerActiveMember: 0,
        revenueShare: 0,
      };
      rows.set(id, current);
    }
    return current;
  };
  input.branches.filter((branch) => branch.status !== 'closed').forEach((branch) => row(branch.id));

  for (const member of input.members) {
    if (member.isArchived) continue;
    const target = row(branchOf(member.branchId));
    target.totalMembers += 1;
    if (isActive(member, now)) target.activeMembers += 1;
    const joined = safeDay(member.createdAt);
    if (joined >= input.from && joined <= input.to) target.newMembers += 1;
  }

  const monthly = new Map(input.months.map((month) => [month, {} as Record<string, number>]));
  for (const entry of input.entries) {
    const amount = amountOf(entry);
    if (!amount) continue;
    const day = dayOf(entry);
    if (!day) continue;
    const branchId = branchOf(entry.branchId, entry.userId);
    const isExpense = String(entry.type ?? 'income').toLowerCase() === 'expense';
    const bucket = monthly.get(day.slice(0, 7));
    if (bucket && !isExpense) bucket[branchId] = round2((bucket[branchId] ?? 0) + amount);
    if (day < input.from || day > input.to) continue;
    const target = row(branchId);
    if (isExpense) target.expense += amount;
    else target.revenue += amount;
  }

  for (const event of input.events) {
    if (!passedIn(event)) continue;
    const day = safeDay(eventTime(event));
    if (day < input.from || day > input.to) continue;
    row(branchOf((event as AccessEvent & { branchId?: string | null }).branchId, event.userId)).checkIns += 1;
  }

  const days = Math.max(1, Math.round((Date.parse(`${input.to}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / 86_400_000) + 1);
  const list = [...rows.values()].filter(
    (item) => item.branchId !== UNASSIGNED || item.totalMembers || item.revenue || item.expense || item.checkIns,
  );
  const totalRevenue = list.reduce((sum, item) => sum + item.revenue, 0);
  for (const item of list) {
    item.revenue = round2(item.revenue);
    item.expense = round2(item.expense);
    item.net = round2(item.revenue - item.expense);
    item.avgDailyCheckIns = round1(item.checkIns / days);
    item.revenuePerActiveMember = item.activeMembers ? round2(item.revenue / item.activeMembers) : 0;
    item.revenueShare = totalRevenue ? round1((item.revenue / totalRevenue) * 100) : 0;
  }
  list.sort((left, right) =>
    left.branchId === UNASSIGNED ? 1 : right.branchId === UNASSIGNED ? -1 : right.revenue - left.revenue || left.branchName.localeCompare(right.branchName, 'tr'),
  );

  const sum = (pick: (item: BranchReportRow) => number) => list.reduce((total, item) => total + pick(item), 0);
  const capacities = list.map((item) => item.capacity).filter((value): value is number => !!value);
  const activeMembers = sum((item) => item.activeMembers);
  const revenue = round2(sum((item) => item.revenue));
  const checkIns = sum((item) => item.checkIns);
  return {
    from: input.from,
    to: input.to,
    days,
    rows: list,
    totals: {
      capacity: capacities.length ? capacities.reduce((a, b) => a + b, 0) : null,
      totalMembers: sum((item) => item.totalMembers),
      activeMembers,
      newMembers: sum((item) => item.newMembers),
      revenue,
      expense: round2(sum((item) => item.expense)),
      net: round2(sum((item) => item.net)),
      checkIns,
      avgDailyCheckIns: round1(checkIns / days),
      revenuePerActiveMember: activeMembers ? round2(revenue / activeMembers) : 0,
    },
    monthly: [...monthly.entries()].map(([month, revenueByBranch]) => ({ month, revenue: revenueByBranch })),
  };
}

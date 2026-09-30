import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

export type InstallmentStatus = 'pending' | 'partial' | 'paid';

export interface Installment {
  no: number;
  /** Calendar date in the gym's time zone, `YYYY-MM-DD`. */
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidAt: string | null;
  status: InstallmentStatus;
}

export interface InstallmentView extends Installment {
  remainingAmount: number;
  overdue: boolean;
  daysLate: number;
}

export interface PlanStanding {
  remainingAmount: number;
  overdueAmount: number;
  overdueCount: number;
  maxDaysLate: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  installments: InstallmentView[];
}

const GYM_TIME_ZONE = 'Europe/Istanbul';
const DAY_MS = 86_400_000;

/** Money is stored in TL with two decimals but every calculation runs on integer kuruş. */
export function toKurus(amount: number): number {
  return Math.round(amount * 100);
}

export function toTl(kurus: number): number {
  return kurus / 100;
}

export function gymToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: GYM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Adds calendar months, clamping to the month's last day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number, anchorDay?: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(anchorDay ?? day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Splits `total` into `count` monthly installments. Each one gets the same whole-kuruş share and
 * the leftover kuruş go to the last installment so the schedule always sums to the total.
 */
export function buildSchedule(total: number, count: number, firstDueDate: string): Installment[] {
  const totalKurus = toKurus(total);
  const base = Math.floor(totalKurus / count);
  const anchorDay = Number(firstDueDate.slice(8, 10));
  return Array.from({ length: count }, (_, index) => {
    const amount = index === count - 1 ? totalKurus - base * (count - 1) : base;
    return {
      no: index + 1,
      dueDate: addMonths(firstDueDate, index, anchorDay),
      amount: toTl(amount),
      paidAmount: 0,
      paidAt: null,
      status: 'pending' as const,
    };
  });
}

export function remainingOf(installments: Installment[]): number {
  return toTl(installments.reduce((sum, item) => sum + toKurus(item.amount) - toKurus(item.paidAmount), 0));
}

/** Applies a payment to the oldest unpaid installments first; a payment may cover several or part of one. */
export function allocatePayment(installments: Installment[], amount: number, paidAt: string): Installment[] {
  let left = toKurus(amount);
  if (left <= 0) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, 'amount must be a positive number');
  }
  if (left > toKurus(remainingOf(installments))) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, 'Payment exceeds the remaining debt');
  }
  const ordered = [...installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.no - b.no);
  const updated = new Map<number, Installment>();
  for (const item of ordered) {
    const open = toKurus(item.amount) - toKurus(item.paidAmount);
    if (left <= 0 || open <= 0) continue;
    const applied = Math.min(open, left);
    left -= applied;
    const paidKurus = toKurus(item.paidAmount) + applied;
    const paid = paidKurus >= toKurus(item.amount);
    updated.set(item.no, {
      ...item,
      paidAmount: toTl(paidKurus),
      paidAt: paid ? paidAt : item.paidAt,
      status: paid ? 'paid' : 'partial',
    });
  }
  return installments.map((item) => updated.get(item.no) ?? item);
}

/** Overdue = due before today and not fully paid; an installment due today is not late yet. */
export function planStanding(installments: Installment[], today: string): PlanStanding {
  const views = installments.map((item) => {
    const remainingKurus = toKurus(item.amount) - toKurus(item.paidAmount);
    const overdue = remainingKurus > 0 && item.dueDate < today;
    return {
      ...item,
      remainingAmount: toTl(remainingKurus),
      overdue,
      daysLate: overdue ? daysBetween(item.dueDate, today) : 0,
    };
  });
  const open = views.filter((item) => item.remainingAmount > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = open.filter((item) => item.overdue);
  return {
    remainingAmount: remainingOf(installments),
    overdueAmount: toTl(overdue.reduce((sum, item) => sum + toKurus(item.remainingAmount), 0)),
    overdueCount: overdue.length,
    maxDaysLate: overdue.reduce((max, item) => Math.max(max, item.daysLate), 0),
    nextDueDate: open[0]?.dueDate ?? null,
    nextDueAmount: open[0]?.remainingAmount ?? 0,
    installments: views,
  };
}

import { Transaction } from 'firebase-admin/firestore';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { hairPrecondition } from './hair-errors';
import { PaymentLine, PaymentMethod, round2 } from './hair-money';
import { HairStore } from './hair-store';

/** One cash register per branch and local day: `hairCashRegisterDays/{branchId}_{YYYY-MM-DD}`. */
export function registerId(branchId: string, date: string): string {
  return `${branchId}_${date}`;
}

/**
 * K-005: cash may only move while the branch's register for that day is open. Card / transfer
 * payments are not blocked. Pass the transaction so the check and the write are atomic.
 */
export async function assertCashAllowed(
  tx: Transaction,
  store: HairStore,
  branchId: string,
  date: string,
  lines: { method: PaymentMethod }[],
): Promise<void> {
  if (!lines.some((line) => line.method === 'cash')) return;
  const snapshot = await tx.get(store.ref(TENANT_COLLECTION.hairCashRegisterDays, registerId(branchId, date)));
  const status = snapshot.exists ? snapshot.data()?.['status'] : undefined;
  if (status !== 'open') {
    throw hairPrecondition(
      status === 'closed'
        ? 'Bugünün kasası kapatılmış; nakit işlem yapılamaz.'
        : 'Kasa açılmamış. Nakit işlem için önce kasayı açın.',
    );
  }
}

export interface CashTotals {
  cashIn: number;
  cashOut: number;
  cashExpenses: number;
  cardTotal: number;
  transferTotal: number;
  otherTotal: number;
  totalIncome: number;
  expectedClosing: number;
  byPaymentMethod: { method: PaymentMethod; amount: number }[];
}

/**
 * Day totals of one register (K-003): expected closing = opening + cash in − cash out (refunds)
 * − cash expenses. Refunds are payments with negative lines, so they net out of every method total.
 */
export function summarizeCash(input: {
  openingBalance: number;
  payments: { lines?: PaymentLine[] }[];
  expenses: { amount: number; paymentMethod?: string }[];
}): CashTotals {
  const byMethod = new Map<PaymentMethod, number>();
  let cashIn = 0;
  let cashOut = 0;
  for (const payment of input.payments) {
    for (const line of payment.lines ?? []) {
      byMethod.set(line.method, (byMethod.get(line.method) ?? 0) + line.amount);
      if (line.method === 'cash') {
        if (line.amount >= 0) cashIn += line.amount;
        else cashOut += -line.amount;
      }
    }
  }
  const cashExpenses = input.expenses
    .filter((expense) => (expense.paymentMethod ?? 'cash') === 'cash')
    .reduce((sum, expense) => sum + expense.amount, 0);
  const total = (method: PaymentMethod) => round2(byMethod.get(method) ?? 0);
  const totalIncome = round2([...byMethod.values()].reduce((sum, value) => sum + value, 0));
  return {
    cashIn: round2(cashIn),
    cashOut: round2(cashOut),
    cashExpenses: round2(cashExpenses),
    cardTotal: round2(total('creditCard') + total('debitCard')),
    transferTotal: total('bankTransfer'),
    otherTotal: total('other'),
    totalIncome,
    expectedClosing: round2(input.openingBalance + cashIn - cashOut - cashExpenses),
    byPaymentMethod: [...byMethod.entries()].map(([method, amount]) => ({ method, amount: round2(amount) })),
  };
}

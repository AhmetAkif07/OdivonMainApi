import { PaymentLine, PaymentMethod, round2 } from './spa-money';

export interface CashDaySummary {
  totalsByMethod: Partial<Record<PaymentMethod, number>>;
  totalIncome: number;
  totalExpense: number;
  totalCommission: number;
  netCash: number;
}

/**
 * Totals for a cash register day. Income is every session payment plus every standalone payment
 * (refunds are negative payments, so they net out); net cash is income minus expenses. Commission
 * accruals are reported but not deducted — they are paid out separately.
 */
export function summarizeCashDay(input: {
  sessions: { payments?: PaymentLine[] }[];
  payments: PaymentLine[];
  expenses: { amount: number }[];
  accruals: { amount: number }[];
}): CashDaySummary {
  const totalsByMethod: Partial<Record<PaymentMethod, number>> = {};
  let totalIncome = 0;
  const add = (line: PaymentLine) => {
    totalsByMethod[line.method] = round2((totalsByMethod[line.method] ?? 0) + line.amount);
    totalIncome += line.amount;
  };

  for (const session of input.sessions) {
    for (const payment of session.payments ?? []) add(payment);
  }
  for (const payment of input.payments) add(payment);

  const totalExpense = input.expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalCommission = input.accruals.reduce((sum, a) => sum + a.amount, 0);

  return {
    totalsByMethod,
    totalIncome: round2(totalIncome),
    totalExpense: round2(totalExpense),
    totalCommission: round2(totalCommission),
    netCash: round2(totalIncome - totalExpense),
  };
}

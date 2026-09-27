import assert from 'node:assert/strict';
import { summarizeCashDay } from './cash-summary';

test('adds session and standalone payments per method, nets refunds and expenses', () => {
  const summary = summarizeCashDay({
    sessions: [
      {
        payments: [
          { method: 'nakit', amount: 500 },
          { method: 'kart', amount: 250.1 },
        ],
      },
      { payments: [] }, // fully package-redeemed session
      {},
    ],
    payments: [
      { method: 'kart', amount: 100.2 },
      { method: 'kart', amount: -100.2 }, // refund
      { method: 'havale', amount: 300 },
    ],
    expenses: [{ amount: 120.05 }, { amount: 79.95 }],
    accruals: [{ amount: 50 }, { amount: 25.5 }],
  });
  assert.deepEqual(summary.totalsByMethod, { nakit: 500, kart: 250.1, havale: 300 });
  assert.equal(summary.totalIncome, 1050.1);
  assert.equal(summary.totalExpense, 200);
  assert.equal(summary.totalCommission, 75.5);
  assert.equal(summary.netCash, 850.1);
});

test('an empty day is all zeros', () => {
  const summary = summarizeCashDay({ sessions: [], payments: [], expenses: [], accruals: [] });
  assert.deepEqual(summary, {
    totalsByMethod: {},
    totalIncome: 0,
    totalExpense: 0,
    totalCommission: 0,
    netCash: 0,
  });
});

test('floating point sums are rounded to kuruş', () => {
  const summary = summarizeCashDay({
    sessions: [],
    payments: [
      { method: 'nakit', amount: 0.1 },
      { method: 'nakit', amount: 0.2 },
    ],
    expenses: [],
    accruals: [],
  });
  assert.equal(summary.totalsByMethod.nakit, 0.3);
  assert.equal(summary.totalIncome, 0.3);
});

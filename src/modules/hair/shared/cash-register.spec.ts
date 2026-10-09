import { summarizeCash } from './cash-register';

describe('summarizeCash (plan §8.5)', () => {
  it('computes the expected closing as opening + cash in − cash out − cash expenses (K-003)', () => {
    const totals = summarizeCash({
      openingBalance: 500,
      payments: [
        { lines: [{ method: 'cash', amount: 300 }, { method: 'creditCard', amount: 200 }] },
        { lines: [{ method: 'cash', amount: 150 }] },
        { lines: [{ method: 'cash', amount: -100 }] }, // refund
        { lines: [{ method: 'bankTransfer', amount: 400 }, { method: 'debitCard', amount: 50 }] },
      ],
      expenses: [
        { amount: 80, paymentMethod: 'cash' },
        { amount: 1000, paymentMethod: 'bankTransfer' },
      ],
    });
    expect(totals).toMatchObject({
      cashIn: 450,
      cashOut: 100,
      cashExpenses: 80,
      cardTotal: 250,
      transferTotal: 400,
      totalIncome: 1000,
      expectedClosing: 770,
    });
    expect(totals.byPaymentMethod).toEqual(
      expect.arrayContaining([{ method: 'cash', amount: 350 }, { method: 'creditCard', amount: 200 }]),
    );
  });
});

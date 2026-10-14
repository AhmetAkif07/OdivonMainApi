import { calculateQuote } from './rentacar-pricing';

describe('calculateQuote', () => {
  it('selects the duration tier and snapshots tax, discount and fees', () => {
    expect(calculateQuote({
      pickupAt: '2026-10-01T10:00:00.000Z', returnAt: '2026-10-04T10:00:00.000Z',
      ratePlanId: 'rate-1', tiers: [
        { minDays: 1, maxDays: 2, dailyPrice: 1_000 },
        { minDays: 3, maxDays: null, dailyPrice: 800 },
      ], taxRate: 20, extrasAmount: 300, oneWayFee: 200, discountPercent: 10,
      now: new Date('2026-10-01T00:00:00.000Z'),
    })).toEqual({
      currency: 'TRY', rentalDays: 3, baseAmount: 2_400, extrasAmount: 300,
      oneWayFee: 200, discountAmount: 290, netAmount: 2_610, taxRate: 20,
      taxAmount: 522, totalAmount: 3_132, ratePlanId: 'rate-1',
      calculatedAt: '2026-10-01T00:00:00.000Z',
    });
  });
});

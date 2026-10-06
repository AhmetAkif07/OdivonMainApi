import { addVat, assertPayments, extractVat, isMoney, round2 } from './hair-money';

describe('hair-money', () => {
  it('accepts money with at most two decimals', () => {
    expect(isMoney(10.25)).toBe(true);
    expect(isMoney(10.255)).toBe(false);
    expect(isMoney(-1)).toBe(false);
    expect(isMoney(NaN)).toBe(false);
  });

  it('validates payment lines', () => {
    expect(assertPayments([{ method: 'cash', amount: 100 }])).toEqual([{ method: 'cash', amount: 100 }]);
    expect(() => assertPayments([])).toThrow();
    expect(() => assertPayments([{ method: 'bitcoin', amount: 1 }])).toThrow();
    expect(() => assertPayments([{ method: 'cash', amount: 0 }])).toThrow();
  });

  it('computes VAT on VAT-inclusive prices', () => {
    expect(extractVat(120, 20)).toBe(20);
    expect(extractVat(100, 0)).toBe(0);
    expect(addVat(100, 20)).toBe(120);
    expect(round2(1.005 + 1.005)).toBe(2.01);
  });
});

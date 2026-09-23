import { priceDocument, priceLine } from './sale.totals';

describe('priceDocument', () => {
  it('extracts vat when the unit price includes tax', () => {
    const priced = priceLine({ quantity: 1, unitPrice: 110, taxRatio: 10, vatIncluded: true });
    expect(priced.total).toBe(110);
    expect(priced.net).toBe(100);
    expect(priced.vat).toBe(10);
  });

  it('adds vat and subtracts the document discount', () => {
    const priced = priceDocument(
      [{ quantity: 2, unitPrice: 50, taxRatio: 20, vatIncluded: false }],
      10,
    );
    expect(priced.net).toBe(100);
    expect(priced.vat).toBe(20);
    expect(priced.total).toBe(110);
  });
});

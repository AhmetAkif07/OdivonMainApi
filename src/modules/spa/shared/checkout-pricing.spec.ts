import assert from 'node:assert/strict';
import { CheckoutPricingInput, priceCheckout } from './checkout-pricing';
import { AppException } from '../../../shared/errors/app.exception';

const NOW = Date.UTC(2026, 8, 27, 12);

function input(overrides: Partial<CheckoutPricingInput> = {}): CheckoutPricingInput {
  return {
    customerId: 'cust-1',
    staffId: 'staff-1',
    staffDefaultPercent: 10,
    items: [],
    payments: [],
    globalDiscount: 0,
    services: new Map([
      ['masaj', { ad: 'Masaj', fiyat: 800, tur: 'masaj' }],
      ['cilt', { ad: 'Cilt Bakımı', fiyat: 450.5, tur: 'cilt' }],
    ]),
    products: new Map([['krem', { ad: 'Krem', fiyat: 120, mevcutStok: 3 }]]),
    packages: new Map([
      [
        'pkg-1',
        {
          customerId: 'cust-1',
          kalanSeans: 2,
          status: 'active',
          bitisTarihi: new Date(NOW + 86_400_000).toISOString(),
        },
      ],
    ]),
    rules: [],
    now: NOW,
    ...overrides,
  };
}

function rejects(fn: () => unknown, code: string, message?: RegExp) {
  assert.throws(fn, (err: unknown) => {
    assert.ok(err instanceof AppException);
    assert.equal(err.code, code);
    if (message) assert.match(err.message, message);
    return true;
  });
}

test('totals services and products with line and global discounts', () => {
  const result = priceCheckout(
    input({
      items: [
        { kind: 'service', refId: 'masaj', qty: 2, discount: 100 },
        { kind: 'service', refId: 'cilt', qty: 1 },
        { kind: 'product', refId: 'krem', qty: 2, discount: 40 },
      ],
      globalDiscount: 50.5,
      payments: [
        { method: 'nakit', amount: 1000 },
        { method: 'kart', amount: 1100 },
      ],
    }),
  );
  // 1600-100 + 450.5 + 240-40 - 50.5 = 2100
  assert.equal(result.totalAmount, 2100);
  assert.deepEqual([...result.productDecrements], [['krem', 2]]);
  assert.equal(result.resolvedItems.length, 3);
});

test('rejects payments that do not add up to the total', () => {
  const items = [{ kind: 'service' as const, refId: 'masaj', qty: 1 }];
  rejects(
    () => priceCheckout(input({ items, payments: [{ method: 'nakit', amount: 700 }] })),
    'SPA_PRECONDITION',
    /Ödeme/,
  );
  // A 1 kuruş rounding gap is tolerated.
  assert.equal(
    priceCheckout(input({ items, payments: [{ method: 'nakit', amount: 799.99 }] })).totalAmount,
    800,
  );
});

test('a package-redeemed line is free, decrements the package and still earns commission', () => {
  const result = priceCheckout(
    input({ items: [{ kind: 'service', refId: 'masaj', qty: 1, customerPackageId: 'pkg-1' }] }),
  );
  assert.equal(result.totalAmount, 0);
  assert.deepEqual([...result.packageDecrements], [['pkg-1', 1]]);
  assert.deepEqual(result.commissionLines, [{ staffId: 'staff-1', amount: 80 }]);
});

test('package balance is checked across repeated lines', () => {
  const line = { kind: 'service' as const, refId: 'masaj', qty: 1, customerPackageId: 'pkg-1' };
  assert.equal(priceCheckout(input({ items: [line, line] })).packageDecrements.get('pkg-1'), 2);
  rejects(
    () => priceCheckout(input({ items: [line, line, line] })),
    'SPA_PRECONDITION',
    /kalan seans/,
  );
});

test('rejects packages of another customer, inactive or expired packages', () => {
  const items = [{ kind: 'service' as const, refId: 'masaj', qty: 1, customerPackageId: 'pkg-1' }];
  const pkg = input().packages.get('pkg-1')!;
  rejects(
    () =>
      priceCheckout(
        input({ items, packages: new Map([['pkg-1', { ...pkg, customerId: 'other' }]]) }),
      ),
    'SPA_PRECONDITION',
    /müşteriye/,
  );
  rejects(
    () =>
      priceCheckout(
        input({ items, packages: new Map([['pkg-1', { ...pkg, status: 'expired' }]]) }),
      ),
    'SPA_PRECONDITION',
    /aktif/,
  );
  const expired = { ...pkg, bitisTarihi: new Date(NOW - 1).toISOString() };
  rejects(
    () => priceCheckout(input({ items, packages: new Map([['pkg-1', expired]]) })),
    'SPA_PRECONDITION',
    /süresi/,
  );
  rejects(() => priceCheckout(input({ items, packages: new Map() })), 'SPA_NOT_FOUND');
});

test('stock is checked across repeated product lines', () => {
  const line = { kind: 'product' as const, refId: 'krem', qty: 2 };
  rejects(
    () =>
      priceCheckout(input({ items: [line, line], payments: [{ method: 'nakit', amount: 480 }] })),
    'SPA_PRECONDITION',
    /stok/,
  );
});

test('discounts cannot exceed the line or the session total', () => {
  rejects(
    () =>
      priceCheckout(input({ items: [{ kind: 'service', refId: 'masaj', qty: 1, discount: 801 }] })),
    'SPA_INVALID',
    /indirim/,
  );
  rejects(
    () =>
      priceCheckout(input({ items: [{ kind: 'product', refId: 'krem', qty: 1, discount: 121 }] })),
    'SPA_INVALID',
    /indirim/,
  );
  rejects(
    () =>
      priceCheckout(
        input({ items: [{ kind: 'product', refId: 'krem', qty: 1 }], globalDiscount: 121 }),
      ),
    'SPA_INVALID',
    /Genel indirim/,
  );
});

test('commission uses the full line price, before discounts', () => {
  const result = priceCheckout(
    input({
      items: [{ kind: 'service', refId: 'masaj', qty: 1, discount: 300 }],
      payments: [{ method: 'kart', amount: 500 }],
    }),
  );
  assert.deepEqual(result.commissionLines, [{ staffId: 'staff-1', amount: 80 }]);
});

test('unknown services and products are not-found', () => {
  rejects(
    () => priceCheckout(input({ items: [{ kind: 'service', refId: 'yok', qty: 1 }] })),
    'SPA_NOT_FOUND',
  );
  rejects(
    () => priceCheckout(input({ items: [{ kind: 'product', refId: 'yok', qty: 1 }] })),
    'SPA_NOT_FOUND',
  );
});

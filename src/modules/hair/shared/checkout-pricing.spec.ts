import { ErrorCode } from '../../../shared/errors/error-codes';
import {
  CheckoutPricingInput,
  CustomerPackageRecord,
  PackagePlanRecord,
  priceCheckout,
  ProductRecord,
  ServiceRecord,
  StaffRecord,
} from './checkout-pricing';
import { CommissionRuleRecord } from './commission-engine';

const services = new Map<string, ServiceRecord>([
  ['cut', { name: 'Kesim', price: 300, categoryId: 'kesim', vatRate: 20 }],
  [
    'color',
    { name: 'Boya', price: 1200, categoryId: 'boya', vatRate: 20, productsUsed: [{ productId: 'dye', quantity: 60 }] },
  ],
]);
const products = new Map<string, ProductRecord>([
  ['shampoo', { name: 'Şampuan', salePrice: 250, currentStock: 3, vatRate: 20 }],
  ['dye', { name: 'Majirel 6.0', salePrice: 0, currentStock: 100 }],
]);
const staff = new Map<string, StaffRecord>([
  ['st1', { name: 'Ayşe Yılmaz', defaultCommissionPercent: 30 }],
  ['st2', { name: 'Mehmet Kaya', defaultCommissionPercent: 10 }],
]);
const packagePlans = new Map<string, PackagePlanRecord>([
  ['p10', { name: '10 Fön', price: 1500, active: true, totalSessions: 10, validityDays: 180 }],
]);

function input(overrides: Partial<CheckoutPricingInput>): CheckoutPricingInput {
  return {
    customerId: 'c1',
    staffId: 'st1',
    items: [],
    payments: [],
    globalDiscount: 0,
    services,
    products,
    packagePlans,
    customerPackages: new Map(),
    staff,
    rules: [],
    today: '2026-10-08',
    ...overrides,
  };
}

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error('expected an error');
};

describe('priceCheckout (plan §8.2–§8.4)', () => {
  it('prices a single service from the catalog and pays the staff default commission', () => {
    const result = priceCheckout(
      input({
        items: [{ type: 'service', refId: 'cut', quantity: 1 }],
        payments: [{ method: 'cash', amount: 300 }],
      }),
    );
    expect(result.totalAmount).toBe(300);
    expect(result.vatTotal).toBe(50);
    expect(result.resolvedItems[0]).toMatchObject({ name: 'Kesim', unitPrice: 300, lineTotal: 300, staffId: 'st1' });
    expect(result.commissionLines).toEqual([
      expect.objectContaining({ staffId: 'st1', serviceId: 'cut', basisAmount: 300, amount: 90, ruleId: null }),
    ]);
  });

  it('mixes services and products with split payments (P-002) and deducts consumables (S-002)', () => {
    const result = priceCheckout(
      input({
        items: [
          { type: 'service', refId: 'color', quantity: 1, staffId: 'st2' },
          { type: 'product', refId: 'shampoo', quantity: 2, discount: 50 },
        ],
        payments: [
          { method: 'cash', amount: 1000 },
          { method: 'creditCard', amount: 650 },
        ],
      }),
    );
    expect(result.totalAmount).toBe(1650);
    expect(result.productDecrements).toEqual(new Map([['dye', 60], ['shampoo', 2]]));
    expect(result.consumableDecrements).toEqual(new Map([['dye', 60]]));
    expect(result.commissionLines).toEqual([expect.objectContaining({ staffId: 'st2', amount: 120 })]);
  });

  it('computes commissions on the undiscounted price (C-006) with rules', () => {
    const rules: CommissionRuleRecord[] = [
      { id: 'r1', scope: 'serviceCategory', refId: 'kesim', type: 'percent', value: 50, priority: 1, active: true },
    ];
    const result = priceCheckout(
      input({
        rules,
        items: [{ type: 'service', refId: 'cut', quantity: 2, discount: 100 }],
        payments: [{ method: 'cash', amount: 500 }],
      }),
    );
    expect(result.totalAmount).toBe(500);
    expect(result.commissionLines[0]).toMatchObject({ basisAmount: 600, amount: 300, ruleId: 'r1' });
  });

  it('applies the global discount and scales VAT', () => {
    const result = priceCheckout(
      input({
        items: [{ type: 'service', refId: 'cut', quantity: 1 }],
        globalDiscount: 60,
        payments: [{ method: 'debitCard', amount: 240 }],
      }),
    );
    expect(result.subtotal).toBe(300);
    expect(result.totalAmount).toBe(240);
    expect(result.vatTotal).toBe(40);
  });

  it('redeems a package session without charging it (P-003)', () => {
    const customerPackages = new Map<string, CustomerPackageRecord>([
      ['cp1', { customerId: 'c1', remainingSessions: 2, status: 'active', endDate: '2026-12-31', services: [{ serviceId: 'cut' }] }],
    ]);
    const result = priceCheckout(
      input({
        customerPackages,
        items: [{ type: 'service', refId: 'cut', quantity: 1, customerPackageId: 'cp1' }],
        payments: [],
      }),
    );
    expect(result.totalAmount).toBe(0);
    expect(result.packageDecrements).toEqual(new Map([['cp1', 1]]));
    expect(result.commissionLines).toHaveLength(1);
  });

  it('sells a package plan', () => {
    const result = priceCheckout(
      input({
        items: [{ type: 'package', refId: 'p10', quantity: 1 }],
        payments: [{ method: 'bankTransfer', amount: 1500 }],
      }),
    );
    expect(result.packageSales).toEqual(new Map([['p10', 1]]));
    expect(result.commissionLines).toEqual([]);
  });

  it('rejects insufficient stock, summed across lines (S-003)', () => {
    expectCode(
      () =>
        priceCheckout(
          input({
            items: [
              { type: 'product', refId: 'shampoo', quantity: 2 },
              { type: 'product', refId: 'shampoo', quantity: 2 },
            ],
            payments: [{ method: 'cash', amount: 1000 }],
          }),
        ),
      ErrorCode.HAIR_PRECONDITION,
    );
  });

  it('rejects an exhausted, expired or foreign package', () => {
    const pkg = (overrides: Partial<CustomerPackageRecord>) =>
      new Map<string, CustomerPackageRecord>([
        ['cp1', { customerId: 'c1', remainingSessions: 1, status: 'active', endDate: '2026-12-31', ...overrides }],
      ]);
    const items = [{ type: 'service' as const, refId: 'cut', quantity: 2, customerPackageId: 'cp1' }];
    expectCode(() => priceCheckout(input({ customerPackages: pkg({}), items })), ErrorCode.HAIR_PRECONDITION);
    const one = [{ ...items[0], quantity: 1 }];
    expectCode(() => priceCheckout(input({ customerPackages: pkg({ endDate: '2026-10-01' }), items: one })), ErrorCode.HAIR_PRECONDITION);
    expectCode(() => priceCheckout(input({ customerPackages: pkg({ customerId: 'c2' }), items: one })), ErrorCode.HAIR_PRECONDITION);
  });

  it('rejects a line discount above the line (P-004) and a global discount above the total (P-005)', () => {
    expectCode(
      () => priceCheckout(input({ items: [{ type: 'service', refId: 'cut', quantity: 1, discount: 301 }] })),
      ErrorCode.HAIR_INVALID,
    );
    expectCode(
      () => priceCheckout(input({ items: [{ type: 'service', refId: 'cut', quantity: 1 }], globalDiscount: 301 })),
      ErrorCode.HAIR_INVALID,
    );
  });

  it('rejects payments that do not add up to the total (P-001), within ±0.01', () => {
    const items = [{ type: 'service' as const, refId: 'cut', quantity: 1 }];
    expectCode(() => priceCheckout(input({ items, payments: [{ method: 'cash', amount: 299 }] })), ErrorCode.HAIR_PRECONDITION);
    expect(priceCheckout(input({ items, payments: [{ method: 'cash', amount: 300.01 }] })).totalAmount).toBe(300);
  });

  it('rejects unknown catalog ids', () => {
    expectCode(
      () => priceCheckout(input({ items: [{ type: 'service', refId: 'nope', quantity: 1 }] })),
      ErrorCode.HAIR_NOT_FOUND,
    );
  });
});

import { ErrorCode } from '../../../../shared/errors/error-codes';
import { CommissionRule } from './commission.entity';
import { CommissionSale, buildCommissionReport, pickRule } from './commission.logic';
import { CommissionsService } from './commissions.service';

function rule(overrides: Partial<CommissionRule>): CommissionRule {
  return {
    id: 'r',
    name: 'Kural',
    kind: 'commission',
    userId: null,
    staffName: null,
    active: true,
    scope: 'all',
    targetIds: [],
    basis: 'percent',
    rate: 0,
    threshold: 0,
    amount: 0,
    createdAt: '',
    updatedAt: '',
    createdBy: '',
    updatedBy: '',
    deletedAt: null,
    ...overrides,
  } as CommissionRule;
}

const line = (productId: string, quantity: number, unitPrice: number) => ({
  productId,
  quantity,
  unitPrice,
  discount: 0,
  taxRatio: 20,
  vatIncluded: false,
});

const products = new Map([
  ['vac', { id: 'vac', productType: 'vaccine', categoryId: 'c-vac' }],
  ['food', { id: 'food', productType: 'product', categoryId: 'c-food' }],
  ['exam', { id: 'exam', productType: 'service', categoryId: null }],
]);

describe('commission logic', () => {
  it('prefers the most specific rule and a personal rule over a general one', () => {
    const rules = [
      rule({ id: 'all', scope: 'all', rate: 2 }),
      rule({ id: 'type', scope: 'productType', targetIds: ['vaccine'], rate: 5 }),
      rule({ id: 'mine', scope: 'productType', targetIds: ['vaccine'], rate: 7, userId: 'u1' }),
      rule({ id: 'prod', scope: 'product', targetIds: ['food'], rate: 10 }),
      rule({ id: 'off', scope: 'product', targetIds: ['exam'], rate: 50, active: false }),
    ];
    expect(pickRule(rules, 'u1', 'vac', products.get('vac'))!.id).toBe('mine');
    expect(pickRule(rules, 'u2', 'vac', products.get('vac'))!.id).toBe('type');
    expect(pickRule(rules, 'u2', 'food', products.get('food'))!.id).toBe('prod');
    expect(pickRule(rules, 'u2', 'exam', products.get('exam'))!.id).toBe('all');
  });

  it('credits the appointment doctor, spreads the document discount and adds target bonuses', () => {
    const sales: CommissionSale[] = [
      // 1000 + 200 net; 120 off a 1440 gross total → factor 0.9166…
      { id: 's1', type: 'sale', date: '2026-11-03', discount: 120, appointmentId: 'a1', createdBy: 'desk', lines: [line('exam', 1, 1000), line('vac', 2, 100)] },
      { id: 's2', type: 'sale', date: '2026-11-04', discount: 0, appointmentId: null, createdBy: 'desk', lines: [line('food', 3, 100)] },
      { id: 's3', type: 'purchase', date: '2026-11-04', discount: 0, appointmentId: null, createdBy: 'desk', lines: [line('food', 3, 100)] },
      { id: 's4', type: 'sale', date: '2026-12-01', discount: 0, appointmentId: null, createdBy: 'desk', lines: [line('food', 3, 100)] },
    ];
    const report = buildCommissionReport({
      from: '2026-11-01',
      to: '2026-11-30',
      sales,
      products,
      rules: [
        rule({ id: 'svc', name: 'Hizmet %10', scope: 'productType', targetIds: ['service'], rate: 10 }),
        rule({ id: 'vac', name: 'Aşı adet', scope: 'productType', targetIds: ['vaccine'], basis: 'perUnit', rate: 15 }),
        rule({ id: 'goal', name: '1000 TL hedef', kind: 'target', threshold: 1000, amount: 250 }),
      ],
      appointmentDoctors: new Map([['a1', 'dr']]),
      staffNames: new Map([['dr', 'Dr. Ece'], ['desk', 'Sekreter']]),
    });
    const dr = report.rows.find((row) => row.userId === 'dr')!;
    expect(dr.staffName).toBe('Dr. Ece');
    expect(dr.saleCount).toBe(1);
    expect(dr.salesNet).toBe(1100);
    // 10% of 916.67 + 2 × 15
    expect(dr.commission).toBe(121.67);
    expect(dr.targetBonus).toBe(250);
    expect(dr.total).toBe(371.67);
    const desk = report.rows.find((row) => row.userId === 'desk')!;
    expect(desk).toMatchObject({ saleCount: 1, salesNet: 300, commission: 0, targetBonus: 0 });
    expect(report.totals.total).toBe(371.67);
  });
});

describe('commission rule targeting', () => {
  const sale = (id: string, date: string, createdBy: string, qty = 1): CommissionSale => ({
    id, type: 'sale', date, discount: 0, appointmentId: null, createdBy, lines: [line('food', qty, 100)],
  });

  it('applies role rules to members, prefers personal ones and honours active dates', () => {
    const rules = [
      rule({ id: 'role', roleId: 'tech', rate: 5 }),
      rule({ id: 'me', userId: 'u2', rate: 8 }),
      rule({ id: 'nov', rate: 1, validFrom: '2026-11-10', validTo: '2026-11-20' }),
    ];
    expect(pickRule(rules, 'u1', 'food', products.get('food'), ['tech'], '2026-11-05')!.id).toBe('role');
    expect(pickRule(rules, 'u2', 'food', products.get('food'), ['tech'], '2026-11-05')!.id).toBe('me');
    expect(pickRule(rules, 'u3', 'food', products.get('food'), [], '2026-11-05')).toBeNull();
    expect(pickRule(rules, 'u3', 'food', products.get('food'), [], '2026-11-15')!.id).toBe('nov');
  });

  it('pays nothing until the minimum base is reached', () => {
    const report = buildCommissionReport({
      from: '2026-11-01',
      to: '2026-11-30',
      sales: [sale('a', '2026-11-02', 'u1', 2), sale('b', '2026-11-03', 'u2', 6)],
      products,
      rules: [rule({ id: 'min', rate: 10, minTotal: 500 })],
      appointmentDoctors: new Map(),
      staffNames: new Map(),
      staffRoles: new Map(),
    });
    expect(report.rows.find((row) => row.userId === 'u1')!.commission).toBe(0);
    expect(report.rows.find((row) => row.userId === 'u2')!.commission).toBe(60);
  });
});

describe('CommissionsService', () => {
  const repo = { create: jest.fn(), getByIdOrThrow: jest.fn(), save: jest.fn(), collect: jest.fn(), softDelete: jest.fn(), readAll: jest.fn() };
  const identity = { listByCurrentTenant: jest.fn() };
  let service: CommissionsService;

  beforeEach(() => {
    jest.resetAllMocks();
    repo.create.mockImplementation(async (fields) => ({ id: 'new', ...fields }));
    identity.listByCurrentTenant.mockResolvedValue([{ uid: 'u1', displayName: 'Dr. Ece', email: 'e@x' }]);
    service = new CommissionsService(repo as never, identity as never);
  });

  it('stores the staff name and clears targets for an all-lines rule', async () => {
    const created = await service.create({ name: 'Genel', kind: 'commission', userId: 'u1', scope: 'all', targetIds: ['x'], rate: 5 });
    expect(created).toMatchObject({ staffName: 'Dr. Ece', targetIds: [], rate: 5, basis: 'percent' });
  });

  it('rejects a percent over 100 and a scoped rule without targets', async () => {
    await expect(service.create({ name: 'X', kind: 'commission', rate: 120 })).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(service.create({ name: 'X', kind: 'commission', scope: 'category', rate: 5 })).rejects.toMatchObject({
      code: ErrorCode.VALIDATION_ERROR,
    });
  });

  it('stores the role name for a role rule and checks the dates', async () => {
    repo.readAll.mockResolvedValue([{ id: 'tech', name: 'Teknisyen' }]);
    const created = await service.create({ name: 'Teknisyen %3', kind: 'commission', roleId: 'tech', rate: 3 });
    expect(created).toMatchObject({ userId: null, roleId: 'tech', roleName: 'Teknisyen' });
    await expect(
      service.create({ name: 'X', kind: 'commission', rate: 1, validFrom: '2026-12-01', validTo: '2026-11-01' }),
    ).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });

  it('limits the report range to a year', async () => {
    await expect(service.report({ from: '2026-01-01', to: '2027-06-01' })).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
  });
});

import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { HairCatalogService } from './catalog/hair-catalog.service';
import { HairCoreService } from './core/hair-core.service';
import { HairCustomersService } from './customers/hair-customers.service';
import { HairFinanceService } from './finance/hair-finance.service';
import { HairNotificationsService } from './notifications/hair-notifications.service';
import { HairPosService } from './pos/hair-pos.service';
import { HairReportsService } from './reports/hair-reports.service';
import { HairDoc, HairStore } from './shared/hair-store';
import { HairStaffService } from './staff/hair-staff.service';

const OWNER: TenantStore = {
  tenantId: 't1',
  userId: 'owner-1',
  role: 'owner',
  modules: ['hair'],
  email: 'owner@salon.test',
};
const asUser = (userId: string): TenantStore => ({ ...OWNER, userId, role: 'user', email: `${userId}@salon.test` });

function staffCard(id: string, role: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    userId: `u-${id}`,
    firstName: id,
    lastName: 'Test',
    role,
    branchIds: ['main'],
    serviceIds: [],
    workSchedule: [],
    defaultCommissionPercent: 10,
    active: true,
    onlineBookable: true,
    deletedAt: null,
    ...extra,
  };
}

/** P0 hardening (gap analysis): scopes, delete rules, validation, limits, idempotency, booking, SMS, KVKK. */
describe('hair P0 rules (FakeFirestore)', () => {
  let db: FakeFirestore;
  let context: TenantContext;
  let store: HairStore;
  let core: HairCoreService;
  let customers: HairCustomersService;
  let catalog: HairCatalogService;
  let pos: HairPosService;
  let finance: HairFinanceService;
  let reports: HairReportsService;
  let staff: HairStaffService;
  const tenants = {
    getById: jest.fn(async () => ({ id: 't1', name: 'Salon Test', modules: ['hair'], status: 'active' })),
    update: jest.fn(async () => undefined),
  };
  const users = {
    findByUid: jest.fn(async (uid: string) =>
      uid === OWNER.userId ? { role: 'owner', email: OWNER.email, displayName: 'Ayşe Yılmaz' } : { role: 'user', tenantId: 't1' },
    ),
    updateProfile: jest.fn(async () => undefined),
  };
  const as = <T>(who: TenantStore, fn: () => Promise<T>) => context.run(who, fn);
  const asOwner = <T>(fn: () => Promise<T>) => as(OWNER, fn);
  const rows = (collection: string) =>
    [...db.docs.entries()].filter(([key]) => key.startsWith(`tenants/t1/${collection}/`)).map(([, value]) => value as HairDoc);
  const put = (collection: string, doc: Record<string, unknown>) =>
    db.docs.set(`tenants/t1/${collection}/${doc['id']}`, { deletedAt: null, ...doc });

  let customerId: string;
  let cutId: string;

  beforeEach(async () => {
    db = new FakeFirestore();
    context = new TenantContext();
    store = new HairStore({ db, auth: { updateUser: async () => undefined, revokeRefreshTokens: async () => undefined } } as never, context);
    core = new HairCoreService(store, context, tenants as never, users as never);
    customers = new HairCustomersService(store);
    catalog = new HairCatalogService(store);
    const notifications = new HairNotificationsService(store);
    pos = new HairPosService(store, notifications);
    finance = new HairFinanceService(store);
    reports = new HairReportsService(store);
    staff = new HairStaffService(store, context, users as never);

    await asOwner(async () => {
      await core.ensureDefaults();
      put('hairBranches', { id: 'b2', name: 'Şube 2', slug: 'sube-2', active: true, workDayStart: '09:00', workDayEnd: '21:00', workDays: [0, 1, 2, 3, 4, 5, 6] });
      put('hairStaff', staffCard('st1', 'stylist'));
      put('hairStaff', staffCard('ca1', 'cashier'));
      put('hairStaff', staffCard('mg1', 'manager'));
      const category = await catalog.createCategory({ name: 'Kesim' });
      cutId = (await catalog.createService({ categoryId: category.id, name: 'Kesim', durationMinutes: 30, price: 300 })).id;
      customerId = (await customers.create({ firstName: 'Zeynep', lastName: 'Kara', phone: '0532 111 22 33' })).id;
    });
  });

  // ── 2. Permission scope ──

  describe('permission scope', () => {
    beforeEach(() => {
      put('hairCommissions', { id: 'c1', staffId: 'st1', branchId: 'main', amount: 30, date: '2026-10-01', payoutStatus: 'unpaid' });
      put('hairCommissions', { id: 'c2', staffId: 'ca1', branchId: 'main', amount: 5, date: '2026-10-01', payoutStatus: 'unpaid' });
      put('hairPayments', { id: 'p1', branchId: 'main', totalAmount: 100, date: '2026-10-01', lines: [{ method: 'creditCard', amount: 100 }] });
      put('hairPayments', { id: 'p2', branchId: 'b2', totalAmount: 200, date: '2026-10-01', lines: [{ method: 'creditCard', amount: 200 }] });
    });

    it('limits stylists and cashiers to their own commissions', async () => {
      const mine = await as(asUser('u-ca1'), () => finance.listCommissions({}));
      expect(mine.items.map((c) => c.id)).toEqual(['c2']);
      await expect(as(asUser('u-ca1'), () => finance.listCommissions({ staffId: 'st1' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_FORBIDDEN,
      });
      const stylist = await as(asUser('u-st1'), () => finance.listCommissions({}));
      expect(stylist.items.map((c) => c.id)).toEqual(['c1']);
    });

    it('gives cashiers only their own report and dashboard figures', async () => {
      await expect(as(asUser('u-ca1'), () => reports.daily({ date: '2026-10-01', staffId: 'st1' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_FORBIDDEN,
      });
      const daily = await as(asUser('u-ca1'), () => reports.daily({ date: '2026-10-01' }));
      expect(daily).toMatchObject({ revenue: 0, expenses: null, net: null, byPaymentMethod: [] });
      const dashboard = await as(asUser('u-ca1'), () => reports.dashboard({}));
      expect(dashboard.staffPerformance.every((row) => row.staffId === 'ca1')).toBe(true);
    });

    it('limits managers to their branches', async () => {
      const page = await as(asUser('u-mg1'), () => finance.listPayments({}));
      expect(page.items.map((p) => p.id)).toEqual(['p1']);
      await expect(as(asUser('u-mg1'), () => finance.listPayments({ branchId: 'b2' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_FORBIDDEN,
      });
      await expect(as(asUser('u-mg1'), () => catalog.listServices({ branchId: 'b2' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_FORBIDDEN,
      });
      const owner = await asOwner(() => finance.listPayments({}));
      expect(owner.items).toHaveLength(2);
    });

    it('never downgrades the owner or the last active admin', async () => {
      await expect(asOwner(() => staff.update(OWNER.userId, { role: 'manager' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_FORBIDDEN,
      });
      put('hairStaff', staffCard('ad2', 'admin', { branchIds: [] }));
      // With the owner's admin card present a second admin may be demoted …
      await expect(asOwner(() => staff.update('ad2', { role: 'manager' }))).resolves.toMatchObject({ role: 'manager' });
      // … but once they are the only admin left (legacy tenant without an owner card) they may not.
      db.docs.delete(`tenants/t1/hairStaff/${OWNER.userId}`);
      put('hairStaff', staffCard('ad3', 'admin', { branchIds: [] }));
      await expect(as(asUser('u-ad3'), () => staff.update('ad3', { role: 'manager' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_PRECONDITION,
      });
      await expect(as(asUser('u-ad3'), () => staff.remove('ad3'))).rejects.toBeDefined();
    });
  });
});

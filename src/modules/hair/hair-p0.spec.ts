import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ErrorCode } from '../../shared/errors/error-codes';
import { CreateHairProductDto, CreateHairServiceDto } from './catalog/catalog.dto';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { HairAppointmentsService } from './appointments/hair-appointments.service';
import { HairCatalogService } from './catalog/hair-catalog.service';
import { HairCoreService } from './core/hair-core.service';
import { HairCustomersService } from './customers/hair-customers.service';
import { HairFinanceService } from './finance/hair-finance.service';
import { HairNotificationsService } from './notifications/hair-notifications.service';
import { HairPackagesService } from './packages/hair-packages.service';
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
  let finance: HairFinanceService;
  let reports: HairReportsService;
  let staff: HairStaffService;
  let appointments: HairAppointmentsService;
  let packages: HairPackagesService;
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
    void notifications;
    finance = new HairFinanceService(store);
    reports = new HairReportsService(store);
    staff = new HairStaffService(store, context, users as never);
    appointments = new HairAppointmentsService(store);
    packages = new HairPackagesService(store);

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

  const related = (counts: Record<string, number>) => ({
    code: ErrorCode.HAS_RELATED_RECORDS,
    details: { counts },
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

  // ── 3. Delete rules ──

  describe('delete rules', () => {
    const future = '2099-01-05';

    it('keeps customers with history and frees the phone of one without', async () => {
      put('hairAppointments', { id: 'a1', customerId, staffId: 'st1', branchId: 'main', date: future, status: 'confirmed' });
      await expect(asOwner(() => customers.remove(customerId))).rejects.toMatchObject(related({ appointments: 1 }));
      const fresh = await asOwner(() => customers.create({ firstName: 'Yeni', lastName: '', phone: '05550000001' }));
      await expect(asOwner(() => customers.remove(fresh.id))).resolves.toEqual({ id: fresh.id });
      expect(db.docs.get(`tenants/t1/hairCustomers/${fresh.id}`)?.['deletedAt']).toBeTruthy();
      expect(db.docs.has('tenants/t1/hairCustomerPhones/+905550000001')).toBe(false);
    });

    it('keeps staff with future appointments', async () => {
      put('hairAppointments', { id: 'a1', customerId, staffId: 'mg1', branchId: 'main', date: future, status: 'confirmed', services: [{ staffId: 'st1' }] });
      await expect(asOwner(() => staff.remove('st1'))).rejects.toMatchObject(related({ futureAppointments: 1 }));
      put('hairAppointments', { id: 'a1', customerId, staffId: 'st1', branchId: 'main', date: future, status: 'cancelled' });
      await expect(asOwner(() => staff.remove('st1'))).resolves.toEqual({ id: 'st1' });
    });

    it('keeps categories with services, products with movements and sold package plans', async () => {
      const category = rows('hairServiceCategories')[0];
      await expect(asOwner(() => catalog.removeCategory(category.id))).rejects.toMatchObject(related({ services: 1 }));

      const opened = await asOwner(() => catalog.createProduct({ name: 'Sprey', category: 'Bakım', unit: 'adet', purchasePrice: 1, salePrice: 2, minStock: 0, currentStock: 5 }));
      await expect(asOwner(() => catalog.removeProduct(opened.id))).resolves.toEqual({ id: opened.id });
      const sold = await asOwner(() => catalog.createProduct({ name: 'Wax', category: 'Bakım', unit: 'adet', purchasePrice: 1, salePrice: 2, minStock: 0 }));
      put('hairInventoryTransactions', { id: 'm1', productId: sold.id, type: 'out', reason: 'Satış', sessionId: 's1' });
      await expect(asOwner(() => catalog.removeProduct(sold.id))).rejects.toMatchObject(related({ sales: 1 }));

      const plan = await asOwner(() => packages.createPackage({ name: '5 Kesim', services: [{ serviceId: cutId }], totalSessions: 5, price: 1000, validityDays: 90 }));
      put('hairCustomerPackages', { id: 'cp1', packageId: plan.id, customerId, status: 'active' });
      await expect(asOwner(() => packages.removePackage(plan.id))).rejects.toMatchObject(related({ customerPackages: 1 }));
    });

    it('keeps branches with data and the last active branch', async () => {
      put('hairPayments', { id: 'p9', branchId: 'b2', totalAmount: 10, date: '2026-10-01', lines: [] });
      await expect(asOwner(() => core.deleteBranch('b2'))).rejects.toMatchObject(related({ payments: 1 }));
      db.docs.delete('tenants/t1/hairPayments/p9');
      await expect(asOwner(() => core.deleteBranch('b2'))).resolves.toEqual({ id: 'b2' });
      await expect(asOwner(() => core.deleteBranch('main'))).rejects.toMatchObject({ code: ErrorCode.LAST_ACTIVE_BRANCH });
    });

    it('deletes only cancelled appointments without payments', async () => {
      put('hairAppointments', { id: 'a1', customerId, staffId: 'st1', branchId: 'main', date: future, status: 'confirmed' });
      await expect(asOwner(() => appointments.remove('a1'))).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
      put('hairAppointments', { id: 'a1', customerId, staffId: 'st1', branchId: 'main', date: future, status: 'cancelled' });
      put('hairPayments', { id: 'dep', appointmentId: 'a1', branchId: 'main', totalAmount: 50, lines: [] });
      await expect(asOwner(() => appointments.remove('a1'))).rejects.toMatchObject(related({ payments: 1 }));
      db.docs.delete('tenants/t1/hairPayments/dep');
      await expect(asOwner(() => appointments.remove('a1'))).resolves.toEqual({ id: 'a1' });
    });
  });

  // ── 4. Validation ──

  describe('validation', () => {
    const invalidFields = async (cls: new () => object, body: object) =>
      (await validate(plainToInstance(cls, body))).map((error) => error.property);

    it('rejects a duplicate phone in any format with the holder', async () => {
      await expect(asOwner(() => customers.create({ firstName: 'B', lastName: '', phone: '+90 (532) 111-2233' }))).rejects.toMatchObject({
        code: ErrorCode.DUPLICATE_PHONE,
        details: { customerId, customerName: 'Zeynep Kara' },
      });
      const other = await asOwner(() => customers.create({ firstName: 'B', lastName: '', phone: '5320000000' }));
      expect(other['phone']).toBe('+905320000000');
      await expect(asOwner(() => customers.update(other.id, { phone: '0532 111 22 33' }))).rejects.toMatchObject({
        code: ErrorCode.DUPLICATE_PHONE,
      });
    });

    it('rejects a birth date in the future or not on the calendar', async () => {
      await expect(asOwner(() => customers.create({ firstName: 'B', lastName: '', phone: '05320000001', birthDate: '2999-01-01' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_INVALID,
      });
      await expect(asOwner(() => customers.update(customerId, { birthDate: '1990-02-30' }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_INVALID,
      });
      await expect(asOwner(() => customers.update(customerId, { birthDate: '1990-02-28' }))).resolves.toMatchObject({ birthDate: '1990-02-28' });
    });

    it('checks service durations, VAT rates, money decimals and the deposit', async () => {
      const base = { categoryId: 'c', name: 'S', durationMinutes: 30, price: 100 };
      expect(await invalidFields(CreateHairServiceDto, base)).toEqual([]);
      expect(await invalidFields(CreateHairServiceDto, { ...base, durationMinutes: 32 })).toEqual(['durationMinutes']);
      expect(await invalidFields(CreateHairServiceDto, { ...base, durationMinutes: 605 })).toEqual(['durationMinutes']);
      expect(await invalidFields(CreateHairServiceDto, { ...base, vatRate: 18 })).toEqual(['vatRate']);
      expect(await invalidFields(CreateHairServiceDto, { ...base, price: 10.555 })).toEqual(['price']);
      expect(await invalidFields(CreateHairServiceDto, { ...base, price: -1 })).toEqual(['price']);
      expect(await invalidFields(CreateHairProductDto, { name: 'P', category: 'c', unit: 'adet', purchasePrice: 1, salePrice: 2, minStock: 0, vatRate: 10 })).toEqual([]);

      const category = rows('hairServiceCategories')[0];
      await expect(asOwner(() => catalog.createService({ ...base, categoryId: category.id, depositAmount: 150 }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_INVALID,
      });
      await expect(asOwner(() => catalog.updateService(cutId, { price: 50, depositAmount: 60 }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_INVALID,
      });
      await expect(asOwner(() => catalog.updateService(cutId, { processingMinutes: 30 }))).rejects.toMatchObject({
        code: ErrorCode.HAIR_INVALID,
      });
    });
  });
});

import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext, TenantStore } from '../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { HairAppointmentsService } from './appointments/hair-appointments.service';
import { HairBookingService } from './booking/hair-booking.service';
import { HairCatalogService } from './catalog/hair-catalog.service';
import { HairCoreService } from './core/hair-core.service';
import { HairCustomersService } from './customers/hair-customers.service';
import { HairFinanceService } from './finance/hair-finance.service';
import { HairNotificationsService } from './notifications/hair-notifications.service';
import { HairPosService } from './pos/hair-pos.service';
import { addDays, weekday } from './shared/appointment-plan';
import { HairDoc, HairStore } from './shared/hair-store';
import { dateIdInTz } from './shared/hair-time';

const OWNER: TenantStore = {
  tenantId: 't1',
  userId: 'owner-1',
  role: 'owner',
  modules: ['hair'],
  email: 'owner@salon.test',
};

/** A working day (Mon–Sat) at least a week ahead, so "past time" checks never trip. */
function futureWorkday(): string {
  let date = addDays(dateIdInTz('Europe/Istanbul'), 7);
  while (weekday(date) === 0) date = addDays(date, 1);
  return date;
}

describe('hair module flows (FakeFirestore)', () => {
  let db: FakeFirestore;
  let context: TenantContext;
  let store: HairStore;
  let core: HairCoreService;
  let customers: HairCustomersService;
  let catalog: HairCatalogService;
  let appointments: HairAppointmentsService;
  let pos: HairPosService;
  let finance: HairFinanceService;
  let booking: HairBookingService;
  const date = futureWorkday();
  const tenants = {
    getById: jest.fn(async () => ({ id: 't1', name: 'Salon Test', modules: ['hair'], status: 'active' })),
    update: jest.fn(async () => undefined),
  };
  const users = { findByUid: jest.fn(async () => ({ email: 'owner@salon.test', displayName: 'Ayşe Yılmaz' })) };
  const asOwner = <T>(fn: () => Promise<T>) => context.run(OWNER, fn);

  let customerId: string;
  let cutId: string;
  let colorId: string;
  let shampooId: string;

  beforeEach(async () => {
    db = new FakeFirestore();
    context = new TenantContext();
    store = new HairStore({ db, auth: {} } as never, context);
    core = new HairCoreService(store, context, tenants as never, users as never);
    customers = new HairCustomersService(store);
    catalog = new HairCatalogService(store);
    appointments = new HairAppointmentsService(store);
    const notifications = new HairNotificationsService(store);
    pos = new HairPosService(store, notifications);
    finance = new HairFinanceService(store);
    booking = new HairBookingService(store, context, tenants as never, appointments, customers, notifications);

    await asOwner(async () => {
      await core.ensureDefaults();
      db.docs.set('tenants/t1/hairStaff/st1', {
        id: 'st1',
        firstName: 'Ayşe',
        lastName: 'Yılmaz',
        role: 'stylist',
        branchIds: [],
        workSchedule: [],
        defaultCommissionPercent: 30,
        active: true,
        onlineBookable: true,
        color: '#ff0000',
        deletedAt: null,
      });
      const category = await catalog.createCategory({ name: 'Kesim' });
      cutId = (await catalog.createService({ categoryId: category.id, name: 'Kesim', durationMinutes: 30, price: 300 })).id;
      const dye = await catalog.createProduct({ name: 'Boya 6.0', category: 'Boya', unit: 'ml', purchasePrice: 1, salePrice: 0, minStock: 50, currentStock: 100 });
      colorId = (
        await catalog.createService({
          categoryId: category.id,
          name: 'Boya',
          durationMinutes: 90,
          processingMinutes: 40,
          price: 1200,
          productsUsed: [{ productId: dye.id, quantity: 60 }],
        })
      ).id;
      shampooId = (await catalog.createProduct({ name: 'Şampuan', category: 'Bakım', unit: 'adet', purchasePrice: 100, salePrice: 250, minStock: 1, currentStock: 2 })).id;
      customerId = (await customers.create({ firstName: 'Zeynep', lastName: 'Kara', phone: '0532 111 22 33' })).id;
    });
  });

  const book = (startTime: string, serviceIds: string[], staffId = 'st1') =>
    asOwner(() =>
      appointments.save({
        customerId,
        branchId: 'main',
        staffId,
        date,
        startTime,
        services: serviceIds.map((serviceId) => ({ serviceId })),
      }),
    );
  const rows = (collection: string) =>
    [...db.docs.entries()].filter(([key]) => key.startsWith(`tenants/t1/${collection}/`)).map(([, value]) => value as HairDoc);

  // ── Customers ──

  it('keeps customer phones unique per salon and moves the lock on change', async () => {
    await expect(asOwner(() => customers.create({ firstName: 'Başka', lastName: '', phone: '+905321112233' }))).rejects.toMatchObject({
      code: ErrorCode.HAIR_PRECONDITION,
    });
    await asOwner(() => customers.update(customerId, { phone: '0533 000 00 00' }));
    expect(db.docs.has('tenants/t1/hairCustomerPhones/+905321112233')).toBe(false);
    expect(db.docs.get('tenants/t1/hairCustomerPhones/+905330000000')).toMatchObject({ customerId });
    const page = await asOwner(() => customers.list({ search: '0533' }));
    expect(page.items.map((c) => c.id)).toEqual([customerId]);
  });

  it('merges a duplicate customer and re-points its history', async () => {
    const dup = await asOwner(() => customers.create({ firstName: 'Zeynep', lastName: 'K.', phone: '05440000000' }));
    db.docs.set('tenants/t1/hairFormulas/f1', { id: 'f1', customerId: dup.id, formula: '6/0', deletedAt: null });
    const result = await asOwner(() => customers.merge(customerId, { sourceId: dup.id }));
    expect(result.movedRows).toBe(1);
    expect(db.docs.get('tenants/t1/hairFormulas/f1')).toMatchObject({ customerId });
    await expect(asOwner(() => customers.get(dup.id))).rejects.toMatchObject({ code: ErrorCode.HAIR_NOT_FOUND });
  });

  // ── Appointments ──

  it('creates a confirmed appointment with server-computed times and prices', async () => {
    const appointment = await book('10:00', [cutId, colorId]);
    expect(appointment).toMatchObject({
      status: 'confirmed',
      startTime: '10:00',
      endTime: '12:00',
      totalDurationMinutes: 120,
      totalPrice: 1500,
      customerName: 'Zeynep Kara',
      staffName: 'Ayşe Yılmaz',
      staffColor: '#ff0000',
    });
    expect(appointment['startAt']).toBe(`${date}T07:00:00.000Z`);
    expect((appointment['services'] as HairDoc[]).map((s) => s['startOffsetMinutes'])).toEqual([0, 30]);
  });

  it('rejects an overlapping booking for the same staff (R-001) with 409', async () => {
    await book('10:00', [cutId]);
    await expect(book('10:15', [cutId])).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
    await expect(book('10:30', [cutId])).resolves.toMatchObject({ status: 'confirmed' });
  });

  it('serialises concurrent bookings of the same slot (R-011)', async () => {
    const results = await Promise.allSettled([book('14:00', [cutId]), book('14:00', [cutId])]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(rows('hairAppointments')).toHaveLength(1);
  });

  it('lets the stylist take a client while colour is processing (R-012)', async () => {
    await book('10:00', [colorId]); // busy 10:00–10:50, processing 10:50–11:30
    await expect(book('10:50', [cutId])).resolves.toBeDefined();
    await expect(book('11:10', [cutId])).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
  });

  it('rejects bookings outside branch hours (R-005)', async () => {
    await expect(book('20:45', [cutId])).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
  });

  it('counts no-shows on the customer (R-010) and freezes closed appointments (R-008)', async () => {
    const appointment = await book('09:00', [cutId]);
    await asOwner(() => appointments.setStatus(appointment.id, { status: 'noShow' }));
    expect(db.docs.get(`tenants/t1/hairCustomers/${customerId}`)).toMatchObject({ noShowCount: 1 });
    await expect(
      asOwner(() => appointments.save({ customerId, branchId: 'main', staffId: 'st1', date, startTime: '09:30', services: [{ serviceId: cutId }] }, appointment.id)),
    ).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
    await expect(asOwner(() => appointments.setStatus(appointment.id, { status: 'confirmed' }))).rejects.toMatchObject({
      code: ErrorCode.HAIR_PRECONDITION,
    });
  });

  // ── POS ──

  const checkout = (overrides: Record<string, unknown> = {}) =>
    asOwner(() =>
      pos.checkout({
        idempotencyKey: 'key-00000001',
        branchId: 'main',
        customerId,
        staffId: 'st1',
        items: [
          { type: 'service', refId: colorId, quantity: 1 },
          { type: 'product', refId: shampooId, quantity: 1 },
        ],
        payments: [{ method: 'cash', amount: 1450 }],
        ...overrides,
      } as never),
    );

  it('blocks cash while the register is not open (K-005)', async () => {
    await expect(checkout()).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
    await expect(checkout({ payments: [{ method: 'creditCard', amount: 1450 }] })).resolves.toMatchObject({ totalAmount: 1450 });
  });

  it('checks out atomically: stock, commission, payment, appointment and customer stats', async () => {
    await asOwner(() => finance.openRegister({ branchId: 'main', openingBalance: 100 }));
    const appointment = await book('10:00', [colorId]);
    const session = await checkout({ appointmentId: appointment.id });

    expect(session).toMatchObject({ totalAmount: 1450, status: 'completed', staffName: 'Ayşe Yılmaz' });
    expect(session['receiptNo']).toMatch(/^H-\d{8}-0001$/);
    expect(db.docs.get(`tenants/t1/hairProducts/${shampooId}`)).toMatchObject({ currentStock: 1 });
    const dye = rows('hairProducts').find((p) => p['name'] === 'Boya 6.0')!;
    expect(dye['currentStock']).toBe(40);
    expect(rows('hairCommissions')).toEqual([expect.objectContaining({ staffId: 'st1', amount: 360, basisAmount: 1200, payoutStatus: 'unpaid' })]);
    expect(rows('hairPayments')).toEqual([expect.objectContaining({ totalAmount: 1450, sessionId: session.id })]);
    expect(db.docs.get(`tenants/t1/hairAppointments/${appointment.id}`)).toMatchObject({ status: 'completed', sessionId: session.id });
    expect(db.docs.get(`tenants/t1/hairCustomers/${customerId}`)).toMatchObject({ totalVisits: 1, totalSpent: 1450 });
    // low stock (dye 40 <= 50) produced an in-app notification
    expect(rows('hairNotifications').map((n) => n['type'])).toContain('lowStock');

    const today = await asOwner(() => finance.cashRegisterDay({ branchId: 'main' }));
    expect(today).toMatchObject({ cashIn: 1450, expectedClosing: 1550 });
  });

  it('returns the first session for a repeated idempotency key', async () => {
    await asOwner(() => finance.openRegister({ branchId: 'main', openingBalance: 0 }));
    const first = await checkout();
    const second = await checkout();
    expect(second.id).toBe(first.id);
    expect(rows('hairSessions')).toHaveLength(1);
    expect(rows('hairPayments')).toHaveLength(1);
  });

  it('writes nothing when a line fails (insufficient stock)', async () => {
    await asOwner(() => finance.openRegister({ branchId: 'main', openingBalance: 0 }));
    await expect(
      checkout({ items: [{ type: 'product', refId: shampooId, quantity: 5 }], payments: [{ method: 'cash', amount: 1250 }] }),
    ).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
    expect(rows('hairSessions')).toHaveLength(0);
    expect(rows('hairPayments')).toHaveLength(0);
    expect(db.docs.get(`tenants/t1/hairProducts/${shampooId}`)).toMatchObject({ currentStock: 2 });
  });

  it('fully refunds a session: money, stock, commission and visit counter', async () => {
    await asOwner(() => finance.openRegister({ branchId: 'main', openingBalance: 0 }));
    const session = await checkout();
    const refunded = await asOwner(() => pos.refund(session.id, { reason: 'Müşteri memnun kalmadı' }));
    expect(refunded).toMatchObject({ status: 'refunded', refundedAmount: 1450 });
    expect(db.docs.get(`tenants/t1/hairProducts/${shampooId}`)).toMatchObject({ currentStock: 2 });
    const commissionTotal = rows('hairCommissions').reduce((sum, c) => sum + Number(c['amount']), 0);
    expect(commissionTotal).toBe(0);
    expect(db.docs.get(`tenants/t1/hairCustomers/${customerId}`)).toMatchObject({ totalVisits: 0, totalSpent: 0 });
    const today = await asOwner(() => finance.cashRegisterDay({ branchId: 'main' }));
    expect(today).toMatchObject({ cashIn: 1450, cashOut: 1450, expectedClosing: 0 });
    await expect(asOwner(() => pos.refund(session.id, { reason: 'tekrar' }))).rejects.toMatchObject({
      code: ErrorCode.HAIR_PRECONDITION,
    });
  });

  it('closes the register with the counted difference (K-004)', async () => {
    await asOwner(() => finance.openRegister({ branchId: 'main', openingBalance: 100 }));
    await checkout();
    const closed = await asOwner(() => finance.closeRegister({ branchId: 'main', countedBalance: 1540 }));
    expect(closed).toMatchObject({ status: 'closed', closingBalance: 1550, difference: -10 });
    await expect(checkout({ idempotencyKey: 'key-00000002' })).rejects.toMatchObject({ code: ErrorCode.HAIR_PRECONDITION });
  });

  // ── Public booking ──

  it('books online with a token, hides the phone and lets the customer cancel', async () => {
    await expect(context.run(OWNER, () => booking.services('salon-test'))).rejects.toMatchObject({
      code: ErrorCode.HAIR_PRECONDITION,
    }); // online booking is off by default
    await asOwner(() => core.updateSettings({ onlineBookingEnabled: true }));

    const info = await booking.info('salon-test');
    expect(info).toMatchObject({ tenantName: 'Salon Test', branchId: 'main', onlineBookingEnabled: true });
    expect((await booking.services('salon-test')).map((s) => s.name)).toEqual(expect.arrayContaining(['Kesim', 'Boya']));
    expect((await booking.staff('salon-test', [cutId])).map((s) => s.id)).toEqual(['st1']);
    const slots = await booking.slots('salon-test', date, [cutId]);
    expect(slots).toContain('10:00');

    const booked = await booking.book(
      'salon-test',
      { serviceIds: [cutId], date, startTime: '10:00', firstName: 'Ali', lastName: 'Veli', phone: '05559998877' },
      '127.0.0.1',
    );
    expect(booked).toMatchObject({ status: 'pending', staffName: 'Ayşe Yılmaz', customerPhoneMasked: '+90 5** *** **77' });
    expect(booked.token).toBeTruthy();
    expect(JSON.stringify(rows('hairAppointments'))).not.toContain(booked.token!);
    expect(await booking.slots('salon-test', date, [cutId])).not.toContain('10:00');

    await expect(booking.getAppointment('salon-test', booked.id, 'x'.repeat(32))).rejects.toMatchObject({
      code: ErrorCode.HAIR_NOT_FOUND,
    });
    const cancelled = await booking.cancel('salon-test', booked.id, booked.token!);
    expect(cancelled.status).toBe('cancelled');
    expect(rows('hairNotifications').map((n) => n['type'])).toEqual(expect.arrayContaining(['onlineBooking', 'onlineCancellation']));
  });

  it('returns 404 for an unknown salon slug', async () => {
    await expect(booking.info('yok-boyle-salon')).rejects.toMatchObject({ code: ErrorCode.HAIR_NOT_FOUND });
  });
});

import { ValidationPipe } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { SaveApmAppointmentDto } from './apm.dto';
import { ApmAppointment, ApmService } from './apm.service';

/** Minimal in-memory stand-in for the Firestore calls ApmService makes. */
function fakeFirestore(tenant: Record<string, unknown> = { membershipStatus: 'trial', trialEndsAt: '2999-01-01T00:00:00.000Z' }) {
  const docs = new Map<string, Record<string, unknown>>();
  const paths = new Map<string, Record<string, unknown>>([['tenants/t1', tenant]]);
  let nextId = 1;
  type Filter = [field: string, op: string, value: string];
  const rows = (filters: Filter[]) =>
    [...docs.entries()]
      .filter(([, data]) =>
        filters.every(([field, op, value]) => {
          const actual = String(data[field]);
          return op === '>=' ? actual >= value : actual < value;
        }),
      )
      .sort(([, a], [, b]) => String(a.startAt).localeCompare(String(b.startAt)))
      .map(([id, data]) => ({ id, data: () => data }));
  const query = (filters: Filter[]) => ({
    where: (field: string, op: string, value: string) => query([...filters, [field, op, value]]),
    orderBy: () => query(filters),
    count: () => ({ get: async () => ({ data: () => ({ count: rows(filters).length }) }) }),
    get: async () => ({ docs: rows(filters) }),
  });
  const collection = {
    ...query([]),
    doc: (id = `a${nextId++}`) => ({
      id,
      get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
      set: async (data: Record<string, unknown>) => void docs.set(id, { ...data }),
      update: async (data: Record<string, unknown>) => void docs.set(id, { ...docs.get(id), ...data }),
    }),
  };
  const doc = (path: string) => ({ get: async () => ({ exists: paths.has(path), data: () => paths.get(path) }) });
  return { docs, paths, firebase: { db: { collection: () => collection, doc } } };
}

describe('ApmService appointments', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const tenant = new TenantContext();
  jest.spyOn(tenant, 'getTenantId').mockReturnValue('t1');
  jest.spyOn(tenant, 'getUserId').mockReturnValue('u1');
  let service: ApmService;
  let docs: Map<string, Record<string, unknown>>;
  let paths: Map<string, Record<string, unknown>>;

  const base = {
    title: 'Strateji görüşmesi',
    customerName: 'Ayşe Demir',
    staffName: 'Elif',
    startAt: '2026-10-09T09:00:00.000Z',
    endAt: '2026-10-09T10:00:00.000Z',
  };
  const dto = (overrides: Partial<SaveApmAppointmentDto> = {}) =>
    pipe.transform({ ...base, ...overrides }, { type: 'body', metatype: SaveApmAppointmentDto }) as Promise<SaveApmAppointmentDto>;
  const code = async (promise: Promise<unknown>) => {
    try {
      await promise;
      return 'ok';
    } catch (error) {
      return (error as AppException).code;
    }
  };

  beforeEach(() => {
    const fake = fakeFirestore();
    docs = fake.docs;
    paths = fake.paths;
    service = new ApmService(fake.firebase as never, tenant, { notifyGuest: jest.fn() } as never);
  });

  it('creates a pending appointment with audit fields and lists it', async () => {
    const created = await service.save(await dto({ notes: '  Hedefler  ' }));
    expect(created).toMatchObject({ ...base, status: 'Pending', notes: 'Hedefler', createdBy: 'u1', updatedBy: 'u1' });
    expect(await service.appointments()).toEqual([created]);
  });

  it('rejects an end time that is not after the start', async () => {
    expect(await code(service.save(await dto({ endAt: base.startAt })))).toBe('APPOINTMENT_INVALID');
  });

  it('rejects malformed input at the validation pipe', async () => {
    await expect(dto({ startAt: 'yarın' })).rejects.toThrow();
    await expect(dto({ title: '' })).rejects.toThrow();
  });

  it('rejects an overlapping appointment for the same staff member, case-insensitively', async () => {
    await service.save(await dto());
    const overlapping = await dto({ staffName: ' elif ', startAt: '2026-10-09T09:30:00.000Z', endAt: '2026-10-09T10:30:00.000Z' });
    expect(await code(service.save(overlapping))).toBe('APPOINTMENT_CONFLICT');
  });

  it('allows back-to-back slots, other staff and cancelled overlaps', async () => {
    const first = await service.save(await dto());
    expect(await code(service.save(await dto({ startAt: base.endAt, endAt: '2026-10-09T11:00:00.000Z' })))).toBe('ok');
    expect(await code(service.save(await dto({ staffName: 'Can' })))).toBe('ok');
    await service.setStatus(first.id, 'Cancelled');
    expect(await code(service.save(await dto()))).toBe('ok');
  });

  it('does not treat an appointment as conflicting with itself when editing', async () => {
    const created = await service.save(await dto());
    const updated = await service.save(await dto({ title: 'Yeni başlık', endAt: '2026-10-09T10:15:00.000Z' }), created.id);
    expect(updated).toMatchObject({ id: created.id, title: 'Yeni başlık', status: 'Pending', createdBy: 'u1' });
  });

  it('keeps the status when an edit omits it', async () => {
    const created = await service.save(await dto());
    await service.setStatus(created.id, 'Confirmed');
    expect((await service.save(await dto({ title: 'Düzenlendi' }), created.id)).status).toBe('Confirmed');
  });

  it('soft-deletes: the record stays but is hidden from lists and lookups', async () => {
    const created: ApmAppointment = await service.save(await dto());
    await service.remove(created.id);
    expect(docs.get(created.id)?.deletedAt).toEqual(expect.any(String));
    expect(await service.appointments()).toEqual([]);
    expect(await code(service.get(created.id))).toBe('APPOINTMENT_NOT_FOUND');
  });

  it('returns not found for unknown ids', async () => {
    expect(await code(service.setStatus('missing', 'Confirmed'))).toBe('APPOINTMENT_NOT_FOUND');
  });

  describe('subscription', () => {
    const subscriptionPath = 'tenants/t1/gymSaasSubscription/t1';
    const activeUntil = { membershipStatus: 'active', subscriptionEndsAt: '2999-01-01T00:00:00.000Z' };

    it('is unlimited during the trial', async () => {
      for (let hour = 0; hour < 21; hour++) {
        const start = `2026-10-09T${String(hour).padStart(2, '0')}:00:00.000Z`;
        await service.save(await dto({ startAt: start, endAt: start.replace(':00:00', ':30:00') }));
      }
      expect(await service.subscription()).toMatchObject({ membershipStatus: 'trial', monthlyLimit: null, usedThisMonth: 21, canCreate: true });
    });

    it('blocks new appointments after the trial ends but still allows edits', async () => {
      const created = await service.save(await dto());
      paths.set('tenants/t1', { membershipStatus: 'trial', trialEndsAt: '2020-01-01T00:00:00.000Z' });
      const subscription = await service.subscription();
      expect(subscription).toMatchObject({ membershipStatus: 'expired', canCreate: false });
      await expect(service.save(await dto({ staffName: 'Can' }))).rejects.toMatchObject({ status: 402 });
      expect((await service.save(await dto({ title: 'Düzenlendi' }), created.id)).title).toBe('Düzenlendi');
    });

    it('caps the limited package at 20 appointments created this month, deleted ones included', async () => {
      paths.set('tenants/t1', activeUntil);
      paths.set(subscriptionPath, { planId: 'apm_limited', status: 'active' });
      for (let i = 0; i < 20; i++) {
        const day = String(1 + i).padStart(2, '0');
        const created = await service.save(await dto({ startAt: `2026-11-${day}T09:00:00.000Z`, endAt: `2026-11-${day}T10:00:00.000Z` }));
        if (i === 0) await service.remove(created.id);
      }
      expect(await service.subscription()).toMatchObject({ planId: 'apm_limited', planName: 'Sınırlı', usedThisMonth: 20, monthlyLimit: 20, canCreate: false });
      await expect(service.save(await dto({ startAt: '2026-11-25T09:00:00.000Z', endAt: '2026-11-25T10:00:00.000Z' }))).rejects.toMatchObject({ status: 403 });
    });

    it('does not count appointments created in earlier months', async () => {
      paths.set('tenants/t1', activeUntil);
      paths.set(subscriptionPath, { planId: 'apm_limited', status: 'active' });
      docs.set('old', { ...base, id: 'old', status: 'Pending', createdAt: '2000-01-01T00:00:00.000Z' });
      expect((await service.subscription()).usedThisMonth).toBe(0);
    });

    it('has no limit on premium and lists both packages', async () => {
      paths.set('tenants/t1', activeUntil);
      paths.set(subscriptionPath, { planId: 'apm_premium', status: 'active' });
      const subscription = await service.subscription();
      expect(subscription).toMatchObject({ planId: 'apm_premium', monthlyLimit: null, canCreate: true });
      expect(subscription.plans.map((plan) => [plan.id, plan.monthlyPrice, plan.monthlyAppointments])).toEqual([
        ['apm_limited', 39.99, 20],
        ['apm_premium', 59.99, null],
      ]);
    });
  });
});

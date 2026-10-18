import { TenantContext } from '../../shared/tenancy/tenant.context';
import { ApmService, CreateGuestApmAppointment } from './apm.service';

function transactionalFirestore() {
  const records = new Map<string, Record<string, unknown>>([
    ['tenants/t1', { membershipStatus: 'trial', trialEndsAt: '2999-01-01T00:00:00.000Z' }],
  ]);
  let id = 0;
  let queue = Promise.resolve();
  const ref = (path: string, docId: string) => ({
    id: docId,
    path: `${path}/${docId}`,
    get: async () => snapshot(records.get(`${path}/${docId}`)),
    set: async (value: Record<string, unknown>) => void records.set(`${path}/${docId}`, value),
  });
  const collection = (path: string) => ({
    doc: (docId = `appointment-${++id}`) => ref(path, docId),
    where: () => ({
      count: () => ({
        get: async () => ({ data: () => ({ count: [...records.keys()].filter((key) => key.startsWith(`${path}/appointment-`)).length }) }),
      }),
    }),
  });
  const db = {
    collection,
    doc: (path: string) => ({ get: async () => snapshot(records.get(path)) }),
    runTransaction: async <T>(work: (tx: {
      get: (document: ReturnType<typeof ref>) => Promise<ReturnType<typeof snapshot>>;
      set: (document: ReturnType<typeof ref>, value: Record<string, unknown>) => void;
      delete: (document: ReturnType<typeof ref>) => void;
    }) => Promise<T>) => {
      const previous = queue;
      let release: () => void = () => {};
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      try {
        return await work({
          get: async (document) => snapshot(records.get(document.path)),
          set: (document, value) => void records.set(document.path, value),
          delete: (document) => void records.delete(document.path),
        });
      } finally {
        release();
      }
    },
  };
  return { db, records };
}

function snapshot(value: Record<string, unknown> | undefined) {
  return { exists: value !== undefined, data: () => value };
}

describe('APM atomic appointment slot locks', () => {
  it('accepts only one of two simultaneous bookings for the same staff and time', async () => {
    const firebase = transactionalFirestore();
    const tenant = new TenantContext();
    jest.spyOn(tenant, 'getTenantId').mockReturnValue('t1');
    jest.spyOn(tenant, 'getUserId').mockReturnValue('public');
    const service = new ApmService(firebase as never, tenant, { notifyGuest: jest.fn() } as never);
    const booking: CreateGuestApmAppointment = {
      branchId: 'branch-1', branchName: 'Merkez', bookingSlug: 'merkez',
      serviceId: 'service-1', serviceName: 'Danışmanlık', durationMinutes: 60,
      staffId: 'staff-1', staffName: 'Elif',
      startAt: '2026-10-20T09:00:00.000Z', endAt: '2026-10-20T10:00:00.000Z',
      customerName: 'Ayşe Demir', customerEmail: 'ayse@example.com', customerPhone: '5551112233',
      bookingTokenHash: 'hash',
    };

    const results = await Promise.allSettled([
      service.createGuestAppointment(booking),
      service.createGuestAppointment({ ...booking, customerName: 'Can Kaya' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });
});

import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { ParkingService } from './parking.service';

function environment() {
  const db = new FakeFirestore();
  const tenant = new TenantContext();
  const service = new ParkingService({ db } as never, tenant);
  const store = { tenantId: 'tenant-a', userId: 'owner-a', role: 'owner' as const, modules: ['parking' as const], email: 'owner@example.com', branchIds: [], allBranches: true };
  return { db, tenant, service, store };
}

describe('parking MVP flow', () => {
  it('runs facility -> entry -> quote -> payment -> exit and keeps idempotency', async () => {
    const env = environment();
    await env.tenant.run(env.store, async () => {
      const facility = await env.service.createFacility({ name: 'Pilot Park', code: 'P1', capacity: 10 });
      const zone = await env.service.createZone({ facilityId: facility.id, name: 'Zemin', code: 'Z', capacity: 10, vehicleCategories: ['car'] });
      await env.service.createTariff({ facilityId: facility.id, name: 'Standart', vehicleCategories: ['car'], graceMinutes: 0, lostTicketFeeKurus: 30_000, bands: [{ fromMinute: 1, toMinute: 60, priceKurus: 5_000 }, { fromMinute: 61, toMinute: null, priceKurus: 10_000 }] });
      const shift = await env.service.openCashShift({ facilityId: facility.id, openingFloatKurus: 2_000 });
      const enteredAt = new Date(Date.now() - 90 * 60_000).toISOString();
      const entry = await env.service.createEntry({ facilityId: facility.id, zoneId: zone.id, plate: '34 ODV 2026', vehicleCategory: 'car', occurredAt: enteredAt }, 'entry-key-0001');
      const duplicate = await env.service.createEntry({ facilityId: facility.id, zoneId: zone.id, plate: '34 ODV 2026', vehicleCategory: 'car', occurredAt: enteredAt }, 'entry-key-0001');
      expect(duplicate.id).toBe(entry.id);
      const quoted = await env.service.quoteSession(entry.id, {});
      expect(quoted.quote?.totalKurus).toBe(10_000);
      await env.service.createPayment({ sessionId: entry.id, cashShiftId: shift.id, method: 'cash', amountKurus: 10_000, version: quoted.version }, 'payment-key-0001');
      const paid = (await env.service.sessions({ status: 'paid' })).items[0];
      const exited = await env.service.exitSession(entry.id, { version: paid.version }, 'exit-key-0001');
      expect(exited.status).toBe('exited');
      const dashboard = await env.service.dashboard(facility.id);
      expect(dashboard.occupied).toBe(0);
      expect(dashboard.todayRevenueKurus).toBe(10_000);
    });
  });

  it('isolates writes below the active tenant path', async () => {
    const env = environment();
    await env.tenant.run(env.store, () => env.service.createFacility({ name: 'Pilot Park', code: 'P1', capacity: 10 }));
    expect([...env.db.docs.keys()].every((path) => path.startsWith('tenants/tenant-a/'))).toBe(true);
  });

  it('reconciles an offline fail-open exit into manual review without leaking capacity', async () => {
    const env = environment();
    await env.tenant.run(env.store, async () => {
      const facility = await env.service.createFacility({ name: 'Pilot Park', code: 'P1', capacity: 2 });
      const zone = await env.service.createZone({ facilityId: facility.id, name: 'Zemin', code: 'Z', capacity: 2, vehicleCategories: ['car'] });
      const lane = await env.service.createLane({ facilityId: facility.id, zoneId: zone.id, name: 'Çıkış', direction: 'exit' });
      await env.service.createEntry({ facilityId: facility.id, zoneId: zone.id, plate: '34 ODV 2026', vehicleCategory: 'car' }, 'agent-entry-0001');
      const result = await env.service.processAgentEvent({ eventId: 'offline-exit-1', laneId: lane.id, kind: 'exit', plate: '34ODV2026', deviceTime: new Date(Date.now() - 30_000).toISOString(), raw: { decision: { reason: 'offline_exit_fail_open' } } }, lane, 'agent-exit-0001');
      expect((result as { status: string }).status).toBe('manual_review');
      expect((await env.service.dashboard(facility.id)).occupied).toBe(0);
    });
  });
});

import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { PlatformBackendsService } from './backends.service';
import { mainTenantToRow, normalizeRemoteSubscription, summarize } from './memberships';

const NOW = new Date('2026-11-26T12:00:00.000Z');
const backend = { id: 'erp', name: 'Odivon ERP' };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('normalizeRemoteSubscription', () => {
  it('treats a missing subscription as "none"', () => {
    expect(normalizeRemoteSubscription(null, NOW)).toMatchObject({ status: 'none', endsAt: null, amount: null });
  });

  it('maps aliases, cycles and defaults the currency', () => {
    const s = normalizeRemoteSubscription(
      { status: 'Trialing', trialEndsAt: '2026-12-01T00:00:00Z', amount: 1490, billingCycle: 'annual' },
      NOW,
    );
    expect(s).toMatchObject({ status: 'trial', billingCycle: 'yearly', currency: 'TRY', amount: 1490, daysLeft: 5 });
  });

  it('marks an "active" subscription whose period has ended as expired', () => {
    expect(normalizeRemoteSubscription({ status: 'active', currentPeriodEnd: '2026-11-01' }, NOW).status).toBe('expired');
  });

  it('ignores invalid values', () => {
    const s = normalizeRemoteSubscription({ status: 'weird', amount: -5, currentPeriodEnd: 'not a date' }, NOW);
    expect(s).toMatchObject({ status: 'active', amount: null, endsAt: null });
  });
});

describe('mainTenantToRow', () => {
  const base = { id: 't1', name: 'Salon', ownerUid: 'u1', modules: ['gym'], status: 'active' } as never as Parameters<typeof mainTenantToRow>[1];

  it('reads trial and paid tenants', () => {
    expect(mainTenantToRow(backend, { ...base, membershipStatus: 'trial', trialEndsAt: '2026-11-30T12:00:00Z' }, NOW)).toMatchObject({
      status: 'trial',
      daysLeft: 4,
    });
    expect(mainTenantToRow(backend, { ...base, membershipStatus: 'active', subscriptionEndsAt: '2026-10-01T00:00:00Z' }, NOW).status).toBe(
      'expired',
    );
  });

  it('keeps the membership of a suspended tenant and flags the tenant', () => {
    const row = mainTenantToRow(
      backend,
      { ...base, status: 'inactive', membershipStatus: 'active', subscriptionEndsAt: '2027-01-01T00:00:00Z' },
      NOW,
    );
    expect(row).toMatchObject({ status: 'active', tenantStatus: 'suspended' });
  });
});

describe('summarize', () => {
  it('counts statuses, expiring soon and monthly recurring revenue', () => {
    const rows = [
      { status: 'active', amount: 1200, currency: 'TRY', billingCycle: 'yearly', daysLeft: 3, isDemo: false },
      { status: 'active', amount: 100, currency: 'TRY', billingCycle: 'monthly', daysLeft: 20, isDemo: false },
      { status: 'active', amount: 999, currency: 'TRY', billingCycle: 'monthly', daysLeft: 20, isDemo: true },
      { status: 'trial', amount: null, currency: null, billingCycle: null, daysLeft: 1, isDemo: false },
      { status: 'expired', amount: null, currency: null, billingCycle: null, daysLeft: -4, isDemo: false },
    ] as never[];
    const s = summarize(rows);
    expect(s.counts).toMatchObject({ active: 3, trial: 1, expired: 1 });
    expect(s.expiringSoon).toBe(2);
    expect(s.monthlyRecurring).toEqual({ TRY: 200 });
  });
});

describe('PlatformBackendsService.memberships', () => {
  it('merges main tenants with remote subscriptions and reports per-backend problems', async () => {
    const db = new FakeFirestore();
    await db.collection('tenants').doc('t1').set({
      id: 't1', name: 'Salon', ownerUid: 'u1', modules: ['gym'], status: 'active', membershipStatus: 'trial',
      trialEndsAt: '2026-11-28T12:00:00Z', deletedAt: null,
    });
    await db.collection('tenants').doc('t2').set({ id: 't2', name: 'Silinen', status: 'active', deletedAt: '2026-01-01' });
    const fetchImpl = jest.fn().mockImplementation((url: string) =>
      url.endsWith('/internal/platform/tenants')
        ? Promise.resolve(
            json({
              items: [
                {
                  id: 'e1', name: 'ERP Müşteri', status: 'active', modules: ['pos'], ownerUid: 'x', ownerEmail: 'a@b.com',
                  memberCount: 2, companyCount: 1, createdAt: null, statusChangedAt: null, statusReason: null,
                  subscription: { plan: 'pro', status: 'active', currentPeriodEnd: '2027-01-01', amount: 2990, billingCycle: 'monthly' },
                },
              ],
              summary: { total: 1, active: 1, suspended: 0, closed: 0, members: 2 },
              generatedAt: 'x',
            }),
          )
        : Promise.resolve(json({})),
    );
    const service = new PlatformBackendsService({ db } as never, { record: jest.fn() } as never);
    service.fetchImpl = fetchImpl as never;
    service.tokens = () => ({ erp: 'secret' });

    const res = await service.memberships(NOW);
    expect(res.items.map((r) => [r.backendId, r.tenantId, r.status])).toEqual([
      ['main', 't1', 'trial'],
      ['erp', 'e1', 'active'],
    ]);
    expect(res.summary.monthlyRecurring).toEqual({ TRY: 2990 });
    const byId = Object.fromEntries(res.backends.map((b) => [b.id, b]));
    expect(byId['erp']).toMatchObject({ ok: true, hasSubscriptionData: true, total: 1 });
    expect(byId['school']).toMatchObject({ ok: false });
  });

  it('keeps other backends when a remote API has no token', async () => {
    const service = new PlatformBackendsService({ db: new FakeFirestore() } as never, { record: jest.fn() } as never);
    service.fetchImpl = jest.fn() as never;
    service.tokens = () => ({});
    const res = await service.memberships(NOW);
    const erp = res.backends.find((b) => b.id === 'erp')!;
    expect(erp.ok).toBe(false);
    expect(erp.error).toContain('PLATFORM_BACKEND_TOKENS');
    expect(res.backends.find((b) => b.id === 'main')!.ok).toBe(true);
  });
});

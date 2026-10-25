import { FakeFirestore } from '../testing/fake-firestore';
import { TenantContext } from '../tenancy/tenant.context';
import { SubscriptionGuard } from './subscription.guard';

describe('SubscriptionGuard', () => {
  const principal = {
    tenantId: 'tenant-a',
    userId: 'owner-a',
    role: 'owner' as const,
    modules: ['fgas' as const],
    email: 'owner@example.test',
  };

  it('allows active trials and rejects an expired trial', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const guard = new SubscriptionGuard({ db } as never, tenant);
    await db.doc('tenants/tenant-a').set({
      membershipStatus: 'trial',
      trialEndsAt: '2999-01-01T00:00:00.000Z',
    });
    await tenant.run(principal, () => expect(guard.canActivate()).resolves.toBe(true));
    await db.doc('tenants/tenant-a').update({ trialEndsAt: '2020-01-01T00:00:00.000Z' });
    await tenant.run(principal, () =>
      expect(guard.canActivate()).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' }),
    );
  });

  it('keeps paid access during grace and closes it afterwards', async () => {
    const db = new FakeFirestore();
    const tenant = new TenantContext();
    const guard = new SubscriptionGuard({ db } as never, tenant);
    await db.doc('tenants/tenant-a').set({
      membershipStatus: 'active',
      subscriptionEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    await tenant.run(principal, () => expect(guard.canActivate()).resolves.toBe(true));
    await db.doc('tenants/tenant-a').update({
      subscriptionEndsAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    });
    await tenant.run(principal, () =>
      expect(guard.canActivate()).rejects.toMatchObject({ code: 'SUBSCRIPTION_REQUIRED' }),
    );
  });
});

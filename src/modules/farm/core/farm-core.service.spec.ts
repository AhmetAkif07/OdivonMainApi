import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { FarmStore } from '../shared/farm-store';
import { FARM_MAIL_DAILY_LIMIT, FarmCoreService } from './farm-core.service';

describe('FarmCoreService billing and mail', () => {
  let db: FakeFirestore;
  let context: TenantContext;
  let tenants: { update: jest.Mock; getById: jest.Mock };
  let service: FarmCoreService;

  const asOwner = <T>(fn: () => Promise<T>) =>
    context.run({ tenantId: 't1', userId: 'owner', role: 'owner', modules: ['farm'], email: 'o@x.com' }, fn);
  const asMember = <T>(role: string, fn: () => Promise<T>) => {
    db.docs.set('tenants/t1/farmMembers/m1', { role, status: 'active', deletedAt: null });
    return context.run({ tenantId: 't1', userId: 'm1', role: 'user', modules: ['farm'], email: 'm@x.com' }, fn);
  };
  const mail = { to: ['a@b.com'], subject: 'Davet', text: 'x', html: '<p>x</p>' };

  beforeEach(() => {
    delete process.env['ALLOW_DEMO_BILLING'];
    db = new FakeFirestore();
    context = new TenantContext();
    tenants = { update: jest.fn().mockResolvedValue(undefined), getById: jest.fn() };
    const store = new FarmStore({ db } as never, context);
    service = new FarmCoreService(store, context, tenants as never, {} as never);
  });

  it('refuses to activate a paid plan without payment', async () => {
    await expect(asOwner(() => service.changePlan({ planId: 'pro' } as never))).rejects.toMatchObject({
      code: 'FARM_PRECONDITION',
    });
    expect(tenants.update).not.toHaveBeenCalled();
  });

  it('demo billing writes an end date so the subscription can expire', async () => {
    process.env['ALLOW_DEMO_BILLING'] = 'true';
    await asOwner(() => service.changePlan({ planId: 'pro' } as never));
    expect(tenants.update).toHaveBeenCalledWith('t1', expect.objectContaining({ membershipStatus: 'active', subscriptionEndsAt: expect.any(String) }));
  });

  it('does not let a non-admin member queue mail', async () => {
    await expect(asMember('okuyucu', () => service.queueMail(mail as never))).rejects.toMatchObject({ code: 'FARM_FORBIDDEN' });
  });

  it('caps queued mail per day', async () => {
    const now = new Date().toISOString();
    for (let i = 0; i < FARM_MAIL_DAILY_LIMIT; i++) db.docs.set(`tenants/t1/farmMailQueue/q${i}`, { createdAt: now });
    await expect(asOwner(() => service.queueMail(mail as never))).rejects.toMatchObject({ code: 'FARM_PRECONDITION' });
  });

  it('queues mail for an admin under the cap', async () => {
    await expect(asOwner(() => service.queueMail(mail as never))).resolves.toEqual({ id: expect.any(String) });
  });
});

import { TenantContext } from '../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentsService } from './payments.service';
import { SAAS_SANDBOX_PRICES } from './saas-prices';
import { addMonths, daysUntil, effectiveSubscription, nextPeriod, receiptNo } from './saas-billing';
import { SaasBillingService } from './saas-billing.service';

const PRO_YEARLY_KURUS = SAAS_SANDBOX_PRICES.pro.yearly * 100;

const NOW = new Date('2026-10-01T09:00:00Z');

describe('SaaS billing rules', () => {
  it('adds calendar months and clamps to the end of shorter months', () => {
    expect(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(new Date('2026-10-01T09:00:00Z'), 12).toISOString()).toBe('2027-10-01T09:00:00.000Z');
  });

  it('starts the next period at the current end when renewing early, otherwise now', () => {
    expect(nextPeriod('2026-10-20T00:00:00.000Z', 'monthly', NOW)).toEqual({
      startsAt: '2026-10-20T00:00:00.000Z',
      endsAt: '2026-11-20T00:00:00.000Z',
    });
    expect(nextPeriod('2026-09-01T00:00:00.000Z', 'yearly', NOW)).toEqual({
      startsAt: NOW.toISOString(),
      endsAt: '2027-10-01T09:00:00.000Z',
    });
    expect(nextPeriod(null, 'monthly', NOW).startsAt).toBe(NOW.toISOString());
  });

  it('keeps a paid gym active for 3 days after the end date, then expired', () => {
    const tenant = { membershipStatus: 'active', subscriptionEndsAt: '2026-10-01T00:00:00.000Z' };
    expect(effectiveSubscription(tenant, new Date('2026-09-30T12:00:00Z'))).toMatchObject({ membershipStatus: 'active', inGrace: false });
    expect(effectiveSubscription(tenant, new Date('2026-10-03T12:00:00Z'))).toMatchObject({
      membershipStatus: 'active',
      inGrace: true,
      graceEndsAt: '2026-10-04T00:00:00.000Z',
    });
    expect(effectiveSubscription(tenant, new Date('2026-10-04T00:00:01Z'))).toMatchObject({ membershipStatus: 'expired' });
    // trials and gyms without a paid period are left as they are
    expect(effectiveSubscription({ membershipStatus: 'trial', trialEndsAt: 'x' }, NOW)).toMatchObject({ membershipStatus: 'trial', graceEndsAt: null });
  });

  it('counts days by Istanbul calendar day and builds receipt numbers', () => {
    expect(daysUntil('2026-10-08T09:00:00.000Z', '2026-10-01')).toBe(7);
    expect(daysUntil('2026-10-01T22:30:00.000Z', '2026-10-01')).toBe(1); // 01:30 on 2 Oct in Istanbul
    expect(receiptNo('ab12cd34-0000-4000-8000-000000000000', '2026-10-01T09:00:00.000Z')).toBe('ODV-20261001-AB12CD34');
  });
});

describe('SaaS payment activation and reminders', () => {
  let db: FakeFirestore;
  let service: PaymentsService;
  let billing: SaasBillingService;
  let provider: { id: 'iyzico'; mode: jest.Mock; configured: jest.Mock; createCheckout: jest.Mock; verifyCheckout: jest.Mock };
  const context = new TenantContext();
  const asOwner = <R>(fn: () => Promise<R>) =>
    context.run({ tenantId: 't1', userId: 'owner-1', role: 'owner', modules: ['gym'], email: '' }, fn);
  const buyer = { name: 'Ali', surname: 'Veli', identityNumber: '11111111111', email: 'a@b.com', gsmNumber: '+905551112233', address: 'Adres', city: 'Ankara', country: 'Turkey' };
  const doc = (path: string) => db.docs.get(path) as Record<string, unknown> | undefined;
  const rows = (prefix: string) => [...db.docs.entries()].filter(([key]) => key.startsWith(prefix)).map(([, v]) => v);

  async function pay(planId: 'starter' | 'pro', billingCycle: 'monthly' | 'yearly') {
    const order = await asOwner(() => service.createSaasOrder({ planId, billingCycle }));
    const session = await asOwner(() => service.createCheckout({ source: 'saas_subscription', sourceId: order.id, ...buyer }, '1.2.3.4'));
    const token = String(doc(`paymentSessions/${session.id}`)!['token']);
    return { session, token };
  }

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    db = new FakeFirestore();
    let n = 0;
    provider = {
      id: 'iyzico',
      mode: jest.fn(() => 'live'),
      configured: jest.fn(() => true),
      createCheckout: jest.fn(async () => ({ token: `tok-${++n}`, paymentPageUrl: `https://cpp.iyzipay.com/${n}` })),
      verifyCheckout: jest.fn(async () => ({ status: 'succeeded', providerPaymentId: 'pay-9' })),
    };
    service = new PaymentsService({ db } as never, context, provider as unknown as IyzicoProvider);
    billing = new SaasBillingService({ db } as never, context);
    db.docs.set('tenants/t1', { id: 't1', membershipStatus: 'trial', trialEndsAt: '2026-09-28T00:00:00.000Z' });
  });
  afterEach(() => {
    jest.useRealTimers();
    delete process.env.SAAS_ACTIVATE_ON_SANDBOX;
  });

  it('activates the plan once after a verified live payment and records a receipt', async () => {
    const { session, token } = await pay('pro', 'yearly');
    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amountKurus: PRO_YEARLY_KURUS }), undefined); // platform keys
    await Promise.all([service.handleCallback(session.id, token), service.handleCallback(session.id, token)]);

    expect(doc('tenants/t1')).toMatchObject({ membershipStatus: 'active', subscriptionEndsAt: '2027-10-01T09:00:00.000Z' });
    expect(doc('tenants/t1/gymSaasSubscription/t1')).toMatchObject({
      planId: 'pro', billingCycle: 'yearly', status: 'active',
      currentPeriodStartsAt: NOW.toISOString(), currentPeriodEndsAt: '2027-10-01T09:00:00.000Z',
    });
    const history = await asOwner(() => billing.history());
    expect(history).toEqual([expect.objectContaining({ amountKurus: PRO_YEARLY_KURUS, mode: 'live', providerPaymentId: 'pay-9', receiptNo: expect.stringMatching(/^ODV-20261001-/) })]);
    expect(rows('tenants/t1/paymentSaasOrders/')).toEqual([expect.objectContaining({ status: 'paid' })]);
    expect(await service.returnUrl(session.id, 'succeeded')).toContain('/subscription-result?paymentSession=');
  });

  it('extends from the current end when renewing early', async () => {
    db.docs.set('tenants/t1/gymSaasSubscription/t1', { id: 't1', status: 'active', planId: 'starter', currentPeriodEndsAt: '2026-10-20T00:00:00.000Z' });
    const { session, token } = await pay('starter', 'monthly');
    await service.handleCallback(session.id, token);
    expect(doc('tenants/t1')!['subscriptionEndsAt']).toBe('2026-11-20T00:00:00.000Z');
  });

  it('does not activate a real subscription from a sandbox (test card) payment unless allowed', async () => {
    provider.mode.mockReturnValue('sandbox');
    const first = await pay('pro', 'monthly');
    await service.handleCallback(first.session.id, first.token);
    expect(doc('tenants/t1')!['membershipStatus']).toBe('trial');
    expect(rows('tenants/t1/saasPayments/')).toHaveLength(0);
    expect(rows('tenants/t1/paymentSaasOrders/')).toEqual([expect.objectContaining({ status: 'sandbox_succeeded' })]);

    process.env.SAAS_ACTIVATE_ON_SANDBOX = 'true';
    const second = await pay('pro', 'monthly');
    await service.handleCallback(second.session.id, second.token);
    expect(doc('tenants/t1')!['membershipStatus']).toBe('active');
    expect(rows('tenants/t1/saasPayments/')).toEqual([expect.objectContaining({ mode: 'sandbox' })]);
  });

  it('leaves the subscription untouched when the payment failed', async () => {
    provider.verifyCheckout.mockResolvedValueOnce({ status: 'failed', providerPaymentId: null });
    const { session, token } = await pay('pro', 'monthly');
    await service.handleCallback(session.id, token);
    expect(doc('tenants/t1')!['membershipStatus']).toBe('trial');
    expect(doc('tenants/t1/gymSaasSubscription/t1')).toBeUndefined();
  });

  it('sends each owner reminder once: 7, 3, 1 days before and when the grace period starts', async () => {
    db.docs.set('tenants/t1', { id: 't1', membershipStatus: 'active', subscriptionEndsAt: '2026-10-11T09:00:00.000Z' });
    const run = (day: string) => asOwner(() => billing.runReminders(day));
    expect(await run('2026-10-03')).toBe(0); // 8 days before
    expect(await run('2026-10-04')).toBe(1); // 7
    expect(await run('2026-10-04')).toBe(0); // same day again
    expect(await run('2026-10-08')).toBe(1); // 3
    expect(await run('2026-10-10')).toBe(1); // 1
    expect(await run('2026-10-12')).toBe(1); // grace started
    const notices = await asOwner(() => billing.notices());
    expect(notices.map((n) => n.daysLeft).sort((a, b) => a - b)).toEqual([-1, 1, 3, 7]);
    expect(await asOwner(() => billing.markNoticesRead())).toEqual({ updated: 4 });
    expect((await asOwner(() => billing.notices())).every((n) => n.readAt)).toBe(true);
    expect(await asOwner(() => billing.status())).toMatchObject({ membershipStatus: 'active', graceDays: 3, daysLeft: 10 });
  });
});

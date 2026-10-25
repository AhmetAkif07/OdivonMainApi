import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentsService } from './payments.service';
import { SAAS_SANDBOX_PRICES } from './saas-prices';

const PRO_YEARLY_KURUS = SAAS_SANDBOX_PRICES.pro.yearly * 100;

describe('PaymentsService tenant and source boundaries', () => {
  const documents = new Map<string, Record<string, unknown>>();
  const get = (path: string) => Promise.resolve({ exists: documents.has(path), data: () => documents.get(path) });
  const doc = (path: string) => ({
    path, get: () => get(path),
    set: async (data: Record<string, unknown>) => { documents.set(path, data); },
  });
  const tx = {
    get: (ref: { path: string }) => get(ref.path),
    update: (ref: { path: string }, data: Record<string, unknown>) => {
      documents.set(ref.path, { ...documents.get(ref.path), ...data });
    },
  };
  const db = {
    doc,
    runTransaction: (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
    collection: (name: string) => ({
      doc: (id: string) => doc(`${name}/${id}`),
      where: (_field: string, _operator: string, value: string) => ({ get: async () => ({
        docs: [...documents.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && data.saleId === value)
          .map(([, data]) => ({ data: () => data })),
      }) }),
    }),
  };
  const firebase = { db } as unknown as FirebaseService;
  let role: 'owner' | 'admin' = 'owner';
  let modules: string[] | undefined;
  const tenant = { getTenantId: () => 'tenant-a', getUserId: () => 'staff-a',
    getStore: () => ({ role, modules }) } as TenantContext;
  const iyzico = { id: 'iyzico', verifyCheckout: jest.fn() } as unknown as IyzicoProvider;
  const service = new PaymentsService(firebase, tenant, iyzico);

  beforeEach(() => { documents.clear(); role = 'owner'; modules = undefined; jest.clearAllMocks(); });

  it('derives the vet charge from the tenant sale minus recorded collections', async () => {
    documents.set('tenants/tenant-a/sales/sale-1', { type: 'sale', customerId: 'customer-1', total: 120.5 });
    documents.set('tenants/tenant-a/collections/paid-1', { saleId: 'sale-1', kind: 'collection', amount: 20.25 });
    documents.set('tenants/tenant-b/collections/paid-2', { saleId: 'sale-1', kind: 'collection', amount: 999 });
    await expect(service['resolveSource']('tenant-a', 'vet_sale', 'sale-1')).resolves.toEqual({
      amountKurus: 10025, buyerId: 'customer-1',
    });
  });

  it('uses only the open gym receivable remaining amount', async () => {
    documents.set('tenants/tenant-a/gymReceivables/plan-1', { status: 'open', userId: 'member-1', remainingAmount: 65.75 });
    await expect(service['resolveSource']('tenant-a', 'gym_receivable', 'plan-1')).resolves.toEqual({
      amountKurus: 6575, buyerId: 'member-1',
    });
    documents.set('tenants/tenant-a/gymReceivables/plan-1', { status: 'paid', userId: 'member-1', remainingAmount: 0 });
    await expect(service['resolveSource']('tenant-a', 'gym_receivable', 'plan-1')).rejects.toThrow('not open');
  });

  it('does not expose another tenant payment session', async () => {
    documents.set('paymentSessions/foreign', { id: 'foreign', tenantId: 'tenant-b', token: 'token' });
    await expect(service.get('foreign')).rejects.toThrow('not found');
  });

  it('rejects a callback token before asking the provider', async () => {
    documents.set('paymentSessions/attempt', { id: 'attempt', tenantId: 'tenant-a',
      provider: 'iyzico', token: 'real-token', status: 'pending' });
    await expect(service.handleCallback('attempt', 'forged-token')).rejects.toThrow('Invalid checkout token');
    expect(iyzico.verifyCheckout).not.toHaveBeenCalled();
  });

  it('uses server prices for SaaS orders and records sandbox success without activating the license', async () => {
    const order = await service.createSaasOrder({ planId: 'pro', billingCycle: 'yearly' });
    expect(order.amountKurus).toBe(PRO_YEARLY_KURUS);
    await expect(service['resolveSource']('tenant-a', 'saas_subscription', order.id)).resolves.toEqual({
      amountKurus: PRO_YEARLY_KURUS, buyerId: 'tenant-a',
    });
    documents.set('paymentSessions/saas-session', {
      id: 'saas-session', tenantId: 'tenant-a', provider: 'iyzico', source: 'saas_subscription',
      sourceId: order.id, amountKurus: PRO_YEARLY_KURUS, token: 'valid-token', status: 'pending',
    });
    documents.set(`tenants/tenant-a/paymentReservations/saas_subscription_${order.id}`, {
      sessionId: 'saas-session', status: 'pending',
    });
    (iyzico.verifyCheckout as jest.Mock).mockResolvedValue({ status: 'succeeded', providerPaymentId: 'iyzico-1' });
    await service.handleCallback('saas-session', 'valid-token');
    expect(documents.get(`tenants/tenant-a/paymentSaasOrders/${order.id}`)?.status).toBe('sandbox_succeeded');
    expect(documents.has('tenants/tenant-a/gymSaasSubscription/default')).toBe(false);
    await service.handleCallback('saas-session', 'valid-token');
    expect(documents.get('paymentSessions/saas-session')?.status).toBe('succeeded');
  });

  it('rejects SaaS order creation by a tenant admin', async () => {
    role = 'admin';
    await expect(service.createSaasOrder({ planId: 'starter', billingCycle: 'monthly' }))
      .rejects.toThrow('tenant owner');
    expect([...documents.keys()]).toEqual([]);
  });

  it('sells the APM packages only to APM tenants, at exact kuruş amounts', async () => {
    modules = ['apm'];
    expect(Object.keys(await service.saasPlans())).toEqual(['apm_limited', 'apm_premium']);
    expect((await service.createSaasOrder({ planId: 'apm_limited', billingCycle: 'monthly' })).amountKurus).toBe(3999);
    expect((await service.createSaasOrder({ planId: 'apm_premium', billingCycle: 'monthly' })).amountKurus).toBe(5999);
    await expect(service.createSaasOrder({ planId: 'pro', billingCycle: 'monthly' })).rejects.toThrow('not available');
    await expect(service.createSaasOrder({ planId: 'apm_premium', billingCycle: 'yearly' })).rejects.toThrow('Invalid SaaS plan');

    modules = ['gym'];
    expect(Object.keys(await service.saasPlans())).toEqual(['starter', 'pro', 'enterprise']);
    await expect(service.createSaasOrder({ planId: 'apm_limited', billingCycle: 'monthly' })).rejects.toThrow('not available');
  });
});

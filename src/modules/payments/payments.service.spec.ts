import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentsService } from './payments.service';

describe('PaymentsService tenant and source boundaries', () => {
  const documents = new Map<string, Record<string, unknown>>();
  const get = (path: string) => Promise.resolve({ exists: documents.has(path), data: () => documents.get(path) });
  const doc = (path: string) => ({ path, get: () => get(path) });
  const db = {
    doc,
    collection: (name: string) => ({
      doc: (id: string) => doc(`${name}/${id}`),
      where: (_field: string, _operator: string, value: string) => ({ get: async () => ({
        docs: [...documents.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && data.saleId === value)
          .map(([, data]) => ({ data: () => data })),
      }) }),
    }),
  };
  const firebase = { db } as unknown as FirebaseService;
  const tenant = { getTenantId: () => 'tenant-a', getUserId: () => 'staff-a' } as TenantContext;
  const iyzico = { id: 'iyzico', verifyCheckout: jest.fn() } as unknown as IyzicoProvider;
  const service = new PaymentsService(firebase, tenant, iyzico);

  beforeEach(() => documents.clear());

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
});

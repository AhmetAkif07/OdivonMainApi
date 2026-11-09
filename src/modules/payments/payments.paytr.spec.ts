import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentsService } from './payments.service';
import { PaytrProvider, paytrMerchantOid, paytrSign } from './paytr.provider';
import { PaymentEventInput, PaymentEventsService } from './monitoring/payment-events.service';

const SESSION_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OID = paytrMerchantOid(SESSION_ID);
const ORDER = 'order-1';
const KEY = 'merchant-key';
const SALT = 'merchant-salt';

describe('PaymentsService PayTR notification', () => {
  const documents = new Map<string, Record<string, unknown>>();
  const get = (path: string) => Promise.resolve({ exists: documents.has(path), data: () => documents.get(path) });
  const merge = (path: string, data: Record<string, unknown>) => { documents.set(path, { ...documents.get(path), ...data }); };
  const doc = (path: string) => ({
    path, get: () => get(path),
    set: async (data: Record<string, unknown>) => { documents.set(path, data); },
    update: async (data: Record<string, unknown>) => merge(path, data),
  });
  const tx = {
    get: (ref: { path: string }) => get(ref.path),
    set: (ref: { path: string }, data: Record<string, unknown>) => { documents.set(ref.path, data); },
    update: (ref: { path: string }, data: Record<string, unknown>) => merge(ref.path, data),
  };
  const db = {
    doc,
    runTransaction: (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
    collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
  };
  const tenant = { getTenantId: () => 'tenant-a', getUserId: () => 'owner-a',
    getStore: () => ({ role: 'owner' }) } as unknown as TenantContext;
  const events: PaymentEventInput[] = [];
  const eventLog = { record: async (event: PaymentEventInput) => { events.push(event); } } as unknown as PaymentEventsService;
  const service = new PaymentsService({ db } as unknown as FirebaseService, tenant,
    { id: 'iyzico' } as unknown as IyzicoProvider, undefined, undefined, undefined, new PaytrProvider(), eventLog);
  const env = { ...process.env };

  const notify = (status: string, totalAmount: string, hash?: string) => service.handlePaytrNotification({
    merchant_oid: OID, status, total_amount: totalAmount,
    hash: hash ?? paytrSign(KEY, OID + SALT + status + totalAmount),
  });

  beforeEach(() => {
    documents.clear();
    events.length = 0;
    Object.assign(process.env, { PAYTR_MERCHANT_ID: '123456', PAYTR_MERCHANT_KEY: KEY, PAYTR_MERCHANT_SALT: SALT, SAAS_ACTIVATE_ON_SANDBOX: 'true' });
    documents.set(`tenants/tenant-a/paymentSaasOrders/${ORDER}`, { id: ORDER, planId: 'pro', billingCycle: 'monthly', amountKurus: 12550, status: 'open' });
    documents.set(`paymentSessions/${SESSION_ID}`, {
      id: SESSION_ID, tenantId: 'tenant-a', provider: 'paytr', source: 'saas_subscription', sourceId: ORDER,
      amountKurus: 12550, token: 'iframe-token', status: 'pending', createdBy: 'owner-a', mode: 'sandbox',
    });
    documents.set(`tenants/tenant-a/paymentReservations/saas_subscription_${ORDER}`, { sessionId: SESSION_ID, status: 'pending' });
    documents.set('tenants/tenant-a', { id: 'tenant-a' });
  });

  afterAll(() => { process.env = env; });

  it('rejects a notification with a forged hash', async () => {
    await expect(notify('success', '12550', 'forged')).rejects.toThrow('could not be verified');
    expect(documents.get(`paymentSessions/${SESSION_ID}`)?.status).toBe('pending');
  });

  it('activates the subscription once on a signed success', async () => {
    await expect(notify('success', '12550')).resolves.toEqual({ status: 'succeeded' });
    expect(documents.get(`paymentSessions/${SESSION_ID}`)?.status).toBe('succeeded');
    expect(documents.get(`tenants/tenant-a/paymentSaasOrders/${ORDER}`)?.status).toBe('paid');
    expect(documents.get('tenants/tenant-a')?.membershipStatus).toBe('active');
    expect(documents.get('tenants/tenant-a')).toMatchObject({ planId: 'pro', billingCycle: 'monthly' });
    expect(documents.has(`tenants/tenant-a/saasPayments/${SESSION_ID}`)).toBe(true);
    const endsAt = documents.get('tenants/tenant-a')?.subscriptionEndsAt;
    await expect(notify('success', '12550')).resolves.toEqual({ status: 'succeeded' });
    expect(documents.get('tenants/tenant-a')?.subscriptionEndsAt).toBe(endsAt);
  });

  it('keeps a sandbox success from activating unless allowed', async () => {
    delete process.env.SAAS_ACTIVATE_ON_SANDBOX;
    await notify('success', '12550');
    expect(documents.get(`tenants/tenant-a/paymentSaasOrders/${ORDER}`)?.status).toBe('sandbox_succeeded');
    expect(documents.get('tenants/tenant-a')?.membershipStatus).toBeUndefined();
  });

  it('marks a signed failure as failed without touching the order', async () => {
    await expect(notify('failed', '12550')).resolves.toEqual({ status: 'failed' });
    expect(documents.get(`paymentSessions/${SESSION_ID}`)?.status).toBe('failed');
    expect(documents.get(`tenants/tenant-a/paymentSaasOrders/${ORDER}`)?.status).toBe('open');
  });

  it('records a charged but mismatched amount for review instead of activating', async () => {
    await expect(notify('success', '99900')).resolves.toEqual({ status: 'pending', reviewPending: true });
    expect(documents.get(`paymentSessions/${SESSION_ID}`)).toMatchObject({ status: 'pending', reviewPending: true });
    expect(documents.get(`paymentReviews/${SESSION_ID}`)).toMatchObject({ tenantId: 'tenant-a', providerPaymentId: OID });
    expect(documents.get('tenants/tenant-a')?.membershipStatus).toBeUndefined();
  });

  it('records a charge for an order that is no longer open for review', async () => {
    documents.set(`tenants/tenant-a/paymentSaasOrders/${ORDER}`, { id: ORDER, planId: 'pro', billingCycle: 'monthly', amountKurus: 12550, status: 'cancelled' });
    await expect(notify('success', '12550')).resolves.toMatchObject({ reviewPending: true });
    expect(documents.get(`paymentReviews/${SESSION_ID}`)?.reason).toContain('cannot be verified');
  });

  it('logs the notification and the activation, and keeps the PayTR fields without the hash', async () => {
    await notify('success', '12550');
    expect(events.map((event) => event.type)).toEqual(['notification_received', 'payment_succeeded', 'subscription_activated']);
    const stored = documents.get(`paymentSessions/${SESSION_ID}`)?.providerResult as Record<string, unknown>;
    expect(stored).toMatchObject({ merchant_oid: OID, status: 'success', total_amount: '12550' });
    expect(stored).not.toHaveProperty('hash');
  });

  it('logs a failed payment with the PayTR reason', async () => {
    const status = 'failed';
    await service.handlePaytrNotification({ merchant_oid: OID, status, total_amount: '12550', failed_reason_code: '2',
      failed_reason_msg: 'Yetersiz bakiye', hash: paytrSign(KEY, OID + SALT + status + '12550') });
    const failed = events.find((event) => event.type === 'payment_failed');
    expect(failed?.message).toContain('Yetersiz bakiye');
    expect(documents.get(`paymentSessions/${SESSION_ID}`)?.providerResult).toMatchObject({ failed_reason_code: '2' });
  });

  it('logs a sandbox success that does not activate as a warning', async () => {
    delete process.env.SAAS_ACTIVATE_ON_SANDBOX;
    await notify('success', '12550');
    expect(events.find((event) => event.type === 'payment_sandbox_succeeded')?.level).toBe('warn');
    expect(events.some((event) => event.type === 'subscription_activated')).toBe(false);
  });

  it('logs a forged notification as an error', async () => {
    await expect(notify('success', '12550', 'forged')).rejects.toThrow();
    expect(events[0]).toMatchObject({ type: 'notification_rejected', level: 'error' });
    expect(events[0].detail).not.toHaveProperty('hash');
  });

  it('returns the current state on "check again" without calling iyzico', async () => {
    const result = await service.reconcile(SESSION_ID);
    expect(result).toMatchObject({ id: SESSION_ID, status: 'pending' });
  });
});

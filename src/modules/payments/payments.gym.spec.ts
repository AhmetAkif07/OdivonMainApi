import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { IyzicoProvider } from './iyzico.provider';
import { PaymentsService } from './payments.service';

const NOW = new Date('2026-10-01T09:00:00Z');
const T = 'tenants/t1';

describe('PaymentsService member card payments', () => {
  let db: FakeFirestore;
  let service: PaymentsService;
  let provider: { id: 'iyzico'; mode: jest.Mock; configured: jest.Mock; createCheckout: jest.Mock; verifyCheckout: jest.Mock };
  let accessSync: { syncMemberSafely: jest.Mock };
  let context: TenantContext;
  const as = <R>(userId: string, fn: () => Promise<R>) =>
    context.run({ tenantId: 't1', userId, role: 'user', modules: ['gym'], email: '' }, fn);
  const doc = (path: string) => db.docs.get(path) as Record<string, unknown>;
  const rows = (collection: string) =>
    [...db.docs.entries()].filter(([key]) => key.startsWith(`${T}/${collection}/`)).map(([, value]) => value);
  const tokenOf = (id: string) => String(doc(`paymentSessions/${id}`)['token']);

  beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    db = new FakeFirestore();
    context = new TenantContext();
    let n = 0;
    provider = {
      id: 'iyzico',
      mode: jest.fn(() => 'sandbox'),
      configured: jest.fn(() => true),
      createCheckout: jest.fn(async () => ({ token: `tok-${++n}`, paymentPageUrl: `https://sandbox-cpp.iyzipay.com/form/${n}` })),
      verifyCheckout: jest.fn(async () => ({ status: 'succeeded', providerPaymentId: 'pay-1' })),
    };
    accessSync = { syncMemberSafely: jest.fn(async () => undefined) };
    service = new PaymentsService({ db } as never, context, provider as unknown as IyzicoProvider, accessSync as never);
    db.docs.set(`${T}/paymentSettings/default`, { provider: 'iyzico' });
    db.docs.set(`${T}/gymMembers/m1`, {
      uid: 'm1', displayName: 'Ayşe Yılmaz', email: 'ayse@example.com', phone: '+905551112233', walletBalance: -100,
      membershipStatus: 'active', membershipEndsAt: '2026-10-10T00:00:00.000Z', deletedAt: null,
    });
    db.docs.set(`${T}/gymMembers/m2`, { uid: 'm2', displayName: 'Başka Üye', email: 'b@example.com', walletBalance: 0, deletedAt: null });
    db.docs.set(`${T}/gymPackages/p1`, {
      id: 'p1', name: '3 Aylık', price: 3000, durationDays: 90, classCredits: 12, status: 'active', isHidden: false, deletedAt: null,
    });
    db.docs.set(`${T}/gymInfo/t1`, { city: 'Ankara', address: 'Kızılay 1' });
  });
  afterEach(() => jest.useRealTimers());

  async function expectCode(promise: Promise<unknown>, code: string) {
    await expect(promise).rejects.toBeInstanceOf(AppException);
    await promise.catch((e: AppException) => expect(e.code).toBe(code));
  }

  it('tops up the wallet once, even when iyzico calls back twice at the same time', async () => {
    const session = await as('m1', () => service.createMemberCheckout({ purpose: 'wallet_topup', amount: 250 }, '1.2.3.4', 'https://odivon-panel.dogangns-98.workers.dev'));
    expect(session).toMatchObject({ status: 'pending', amountKurus: 25000, source: 'gym_wallet_topup', paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/form/1' });
    expect(session).not.toHaveProperty('token');
    expect(provider.createCheckout).toHaveBeenCalledWith(expect.objectContaining({
      amountKurus: 25000,
      buyer: expect.objectContaining({ name: 'Ayşe', surname: 'Yılmaz', identityNumber: '11111111111', city: 'Ankara', ip: '1.2.3.4' }),
    }));

    const token = tokenOf(session.id);
    await Promise.all([service.handleCallback(session.id, token), service.handleCallback(session.id, token)]);
    await service.handleCallback(session.id, token);
    expect(doc(`${T}/gymMembers/m1`)['walletBalance']).toBe(150);
    expect(rows('gymWalletTx')).toEqual([expect.objectContaining({ type: 'deposit', amount: 250, paymentMethod: 'card', userId: 'm1' })]);
    expect(rows('gymAccountingEntries')).toEqual([expect.objectContaining({ type: 'income', amount: 250, paymentMethod: 'card', providerPaymentId: 'pay-1' })]);
    expect(doc(`paymentSessions/${session.id}`)).toMatchObject({ status: 'succeeded', fulfilledAt: NOW.toISOString() });
    expect(await service.returnUrl(session.id, 'succeeded')).toBe(
      `https://odivon-panel.dogangns-98.workers.dev/payment-result?paymentSession=${session.id}&status=succeeded`,
    );
  });

  it('renews the membership with the package bought by card and re-syncs the turnstile', async () => {
    const session = await as('m1', () => service.createMemberCheckout({ purpose: 'package', packageId: 'p1' }, '1.2.3.4'));
    expect(session.amountKurus).toBe(300000);
    await service.handleCallback(session.id, tokenOf(session.id));
    expect(doc(`${T}/gymMembers/m1`)).toMatchObject({
      membershipStatus: 'active',
      packageLabel: '3 Aylık',
      classCreditsTotal: 12,
      walletBalance: -100, // card payment does not touch the wallet
    });
    expect(String(doc(`${T}/gymMembers/m1`)['membershipEndsAt'])).toBe('2027-01-08T00:00:00.000Z'); // 10 Oct + 90 days
    expect(rows('gymAccountingEntries')).toEqual([expect.objectContaining({ category: 'membership', amount: 3000, paymentMethod: 'card' })]);
    expect(accessSync.syncMemberSafely).toHaveBeenCalledTimes(1);
    // default return origin when the browser origin is unknown
    expect(await service.returnUrl(session.id, 'succeeded')).toContain('https://odivon-main-api-a2095.web.app/payment-result');
  });

  it('applies nothing on a failed payment or when the result cannot be verified (amount mismatch)', async () => {
    const failed = await as('m1', () => service.createMemberCheckout({ purpose: 'wallet_topup', amount: 100 }, '1.2.3.4'));
    provider.verifyCheckout.mockResolvedValueOnce({ status: 'failed', providerPaymentId: null });
    await service.handleCallback(failed.id, tokenOf(failed.id));
    expect(doc(`paymentSessions/${failed.id}`)['status']).toBe('failed');

    jest.setSystemTime(new Date(NOW.getTime() + 60_000));
    const tampered = await as('m1', () => service.createMemberCheckout({ purpose: 'wallet_topup', amount: 100 }, '1.2.3.4'));
    provider.verifyCheckout.mockRejectedValueOnce(new AppException(ErrorCode.FINANCE_INVALID, 'iyzico payment result could not be verified'));
    await expectCode(service.handleCallback(tampered.id, tokenOf(tampered.id)), ErrorCode.FINANCE_INVALID);
    expect(doc(`paymentSessions/${tampered.id}`)['status']).toBe('pending');
    await expectCode(service.handleCallback(tampered.id, 'forged'), ErrorCode.INVALID_STATUS);

    expect(doc(`${T}/gymMembers/m1`)['walletBalance']).toBe(-100);
    expect(rows('gymWalletTx')).toHaveLength(0);
    expect(rows('gymAccountingEntries')).toHaveLength(0);
  });

  it('pays the member’s own debt plan, lifts the wallet and keeps any excess on the wallet', async () => {
    db.docs.set(`${T}/gymReceivables/r1`, {
      id: 'r1', userId: 'm1', status: 'open', walletLinked: true, packageName: '3 Aylık', deletedAt: null,
      paidAmount: 0, remainingAmount: 100, payments: [],
      installments: [{ no: 1, dueDate: '2026-09-20', amount: 100, paidAmount: 0, paidAt: null, status: 'pending' }],
    });
    await expectCode(as('m2', () => service.createMemberCheckout({ purpose: 'receivable', receivableId: 'r1' }, '1.2.3.4')), ErrorCode.GYM_RECEIVABLE_NOT_FOUND);

    const first = await as('m1', () => service.createMemberCheckout({ purpose: 'receivable', receivableId: 'r1' }, '1.2.3.4'));
    expect(first.amountKurus).toBe(10000);
    await service.handleCallback(first.id, tokenOf(first.id));
    expect(doc(`${T}/gymReceivables/r1`)).toMatchObject({ status: 'paid', remainingAmount: 0, paidAmount: 100 });
    expect(doc(`${T}/gymMembers/m1`)['walletBalance']).toBe(0);

    // A second payment of the same (now settled) plan, e.g. from an old tab, goes to the wallet.
    db.docs.set(`paymentSessions/old`, { ...doc(`paymentSessions/${first.id}`), id: 'old', token: 'old-token', status: 'abandoned', fulfilledAt: null });
    await service.handleCallback('old', 'old-token');
    expect(doc(`${T}/gymMembers/m1`)['walletBalance']).toBe(100);
    expect(rows('gymWalletTx').map((t) => t['description'])).toContain('Fazla ödeme cüzdana eklendi');
  });

  it('reuses a fresh checkout, replaces an expired one and still honours a payment on the old page', async () => {
    const first = await as('m1', () => service.createMemberCheckout({ purpose: 'package', packageId: 'p1' }, '1.2.3.4'));
    const again = await as('m1', () => service.createMemberCheckout({ purpose: 'package', packageId: 'p1' }, '1.2.3.4'));
    expect(again.id).toBe(first.id);
    expect(provider.createCheckout).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date(NOW.getTime() + 31 * 60_000));
    const second = await as('m1', () => service.createMemberCheckout({ purpose: 'package', packageId: 'p1' }, '1.2.3.4'));
    expect(second.id).not.toBe(first.id);
    expect(doc(`paymentSessions/${first.id}`)['status']).toBe('abandoned');

    await service.handleCallback(first.id, tokenOf(first.id));
    expect(doc(`paymentSessions/${first.id}`)['status']).toBe('succeeded');
    expect(rows('gymAccountingEntries')).toHaveLength(1);
  });

  it('refuses hidden packages, out-of-range top-ups and gyms without a provider', async () => {
    db.docs.set(`${T}/gymPackages/hidden`, { id: 'hidden', name: 'Gizli', price: 1, status: 'active', isHidden: true, deletedAt: null });
    await expectCode(as('m1', () => service.createMemberCheckout({ purpose: 'package', packageId: 'hidden' }, 'ip')), ErrorCode.GYM_PACKAGE_NOT_FOUND);
    await expectCode(as('m1', () => service.createMemberCheckout({ purpose: 'wallet_topup', amount: 10 }, 'ip')), ErrorCode.VALIDATION_ERROR);
    db.docs.set(`${T}/paymentSettings/default`, { provider: 'none' });
    await expectCode(as('m1', () => service.createMemberCheckout({ purpose: 'wallet_topup', amount: 100 }, 'ip')), ErrorCode.INVALID_STATUS);
    expect(provider.createCheckout).not.toHaveBeenCalled();
  });
});

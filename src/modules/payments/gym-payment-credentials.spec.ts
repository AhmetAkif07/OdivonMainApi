import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { FakeFirestore } from '../../shared/testing/fake-firestore';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { IyzicoProvider } from './iyzico.provider';
import { decryptSecret, encryptSecret, encryptionKey, maskKey } from './key-vault';

const KEY = Buffer.alloc(32, 3);

describe('payment key vault', () => {
  it('round-trips a secret with AES-GCM and a fresh IV each time', () => {
    const a = encryptSecret('sandbox-secret-123', KEY);
    const b = encryptSecret('sandbox-secret-123', KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain('sandbox-secret');
    expect(decryptSecret(a, KEY)).toBe('sandbox-secret-123');
  });

  it('rejects tampered data, a wrong key and a missing encryption key', () => {
    const sealed = encryptSecret('secret', KEY);
    const [v, iv, data, tag] = sealed.split('.');
    const flipped = `${v}.${iv}.${data.slice(0, -2)}${data.slice(-2) === 'AA' ? 'AB' : 'AA'}.${tag}`;
    expect(() => decryptSecret(flipped, KEY)).toThrow(AppException);
    expect(() => decryptSecret(sealed, Buffer.alloc(32, 4))).toThrow(AppException);
    expect(() => encryptionKey(undefined)).toThrow(/PAYMENT_KEYS_ENC_KEY/);
    expect(() => encryptionKey(Buffer.alloc(16).toString('base64'))).toThrow(/PAYMENT_KEYS_ENC_KEY/);
  });

  it('masks keys to their last four characters', () => {
    expect(maskKey('sandbox-AbCd1234')).toBe('••••1234');
    expect(maskKey('abc')).toBe('••••');
  });
});

describe('GymPaymentCredentialsService', () => {
  let db: FakeFirestore;
  let service: GymPaymentCredentialsService;
  let iyzico: { testCredentials: jest.Mock };
  const context = new TenantContext();
  const as = <R>(tenantId: string, fn: () => Promise<R>) =>
    context.run({ tenantId, userId: 'owner-1', role: 'owner', modules: ['gym'], email: '' }, fn);

  beforeEach(() => {
    process.env.PAYMENT_KEYS_ENC_KEY = KEY.toString('base64');
    db = new FakeFirestore();
    iyzico = { testCredentials: jest.fn(async () => ({ ok: true, message: null })) };
    service = new GymPaymentCredentialsService({ db } as never, context, iyzico as unknown as IyzicoProvider);
  });
  afterEach(() => delete process.env.PAYMENT_KEYS_ENC_KEY);

  it('stores keys encrypted, never returns them and resolves them per gym', async () => {
    const view = await as('t1', () => service.save({ apiKey: ' sandbox-api-AAAA1111 ', secretKey: 'sandbox-sec-BBBB2222', mode: 'sandbox' }));
    expect(view).toEqual(expect.objectContaining({ configured: true, enabled: true, apiKeyHint: '••••1111', secretKeyHint: '••••2222' }));
    expect(JSON.stringify(view)).not.toContain('sandbox-sec');
    const stored = JSON.stringify(db.docs.get('tenants/t1/paymentSettings/iyzico'));
    expect(stored).not.toContain('sandbox-api-AAAA1111');
    expect(stored).not.toContain('sandbox-sec-BBBB2222');

    expect(await service.resolve('t1')).toEqual({ apiKey: 'sandbox-api-AAAA1111', secretKey: 'sandbox-sec-BBBB2222', mode: 'sandbox' });
    expect(await service.resolve('t2')).toBeNull(); // another gym has no keys
  });

  it('changes mode or switches off without re-entering keys; requires both keys on first save', async () => {
    await expect(as('t1', () => service.save({ mode: 'live' }))).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await expect(as('t1', () => service.save({ apiKey: 'only-api' }))).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    await as('t1', () => service.save({ apiKey: 'api-key-1', secretKey: 'secret-key-1' }));
    await as('t1', () => service.save({ mode: 'live' }));
    expect(await service.resolve('t1')).toEqual({ apiKey: 'api-key-1', secretKey: 'secret-key-1', mode: 'live' });
    await as('t1', () => service.save({ enabled: false }));
    expect(await service.resolve('t1')).toBeNull();
    expect(await as('t1', () => service.isAvailable())).toBe(false);
    await as('t1', () => service.remove());
    expect(await as('t1', () => service.view())).toMatchObject({ configured: false, apiKeyHint: null });
  });

  it('tests typed or stored keys without a payment and records the stored result', async () => {
    await expect(as('t1', () => service.test({}))).rejects.toMatchObject({ code: ErrorCode.VALIDATION_ERROR });
    expect(await as('t1', () => service.test({ apiKey: 'typed-api', secretKey: 'typed-secret', mode: 'sandbox' }))).toEqual({ ok: true, message: null, mode: 'sandbox' });
    expect(iyzico.testCredentials).toHaveBeenCalledWith({ apiKey: 'typed-api', secretKey: 'typed-secret', mode: 'sandbox' });

    await as('t1', () => service.save({ apiKey: 'stored-api', secretKey: 'stored-secret' }));
    iyzico.testCredentials.mockResolvedValueOnce({ ok: false, message: 'Geçersiz imza' });
    expect(await as('t1', () => service.test({}))).toMatchObject({ ok: false, message: 'Geçersiz imza' });
    expect((await as('t1', () => service.view())).lastTest).toMatchObject({ ok: false, message: 'Geçersiz imza' });
  });
});

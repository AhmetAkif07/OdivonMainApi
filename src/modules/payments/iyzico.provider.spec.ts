import { createHmac } from 'node:crypto';
import { IyzicoProvider, iyzicoAuthorization, verifyIyzicoSignature } from './iyzico.provider';
import { CheckoutInput } from './payment-provider';

const input: CheckoutInput = {
  id: 'session-1', amountKurus: 12550, source: 'vet_sale', sourceId: 'sale-1',
  callbackUrl: 'https://mainapi.odivon.com/api/v1/payments/callback/iyzico/session-1',
  buyer: { id: 'buyer-1', name: 'Ayşe', surname: 'Yılmaz', identityNumber: '11111111111',
    email: 'ayse@example.com', gsmNumber: '+905550000000', address: 'Test street 1',
    city: 'Istanbul', country: 'Turkey', ip: '127.0.0.1' },
};

const sign = (...fields: Array<string | number>) =>
  createHmac('sha256', 'sandbox-secret').update(fields.join(':')).digest('hex');

describe('IyzicoProvider sandbox checkout', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.IYZICO_SANDBOX_API_KEY;
  const originalSecret = process.env.IYZICO_SANDBOX_SECRET_KEY;

  beforeEach(() => {
    process.env.IYZICO_SANDBOX_API_KEY = 'sandbox-api';
    process.env.IYZICO_SANDBOX_SECRET_KEY = 'sandbox-secret';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.IYZICO_SANDBOX_API_KEY;
    else process.env.IYZICO_SANDBOX_API_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.IYZICO_SANDBOX_SECRET_KEY;
    else process.env.IYZICO_SANDBOX_SECRET_KEY = originalSecret;
  });

  it('signs the exact request body and accepts a signed sandbox checkout', async () => {
    global.fetch = jest.fn(async (_url, request) => {
      const init = request as RequestInit;
      expect(_url).toBe('https://sandbox-api.iyzipay.com/payment/iyzipos/checkoutform/initialize/auth/ecom');
      const headers = init.headers as Record<string, string>;
      const body = String(init.body);
      expect(JSON.parse(body).price).toBe('125.50');
      expect(headers.Authorization).toBe(iyzicoAuthorization('sandbox-api', 'sandbox-secret', headers['x-iyzi-rnd'],
        '/payment/iyzipos/checkoutform/initialize/auth/ecom', body));
      return Response.json({ status: 'success', conversationId: input.id, token: 'checkout-token',
        paymentPageUrl: 'https://sandbox-cpp.iyzipay.com/checkoutform/test', signature: sign(input.id, 'checkout-token') });
    }) as typeof fetch;
    const result = await new IyzicoProvider().createCheckout(input);
    expect(result.token).toBe('checkout-token');
    expect(result.paymentPageUrl).toContain('sandbox-cpp.iyzipay.com');
  });

  it('rejects a forged initialization signature', async () => {
    global.fetch = jest.fn(async () => Response.json({ status: 'success', conversationId: input.id,
      token: 'checkout-token', paymentPageUrl: 'https://sandbox-api.iyzipay.com/checkoutform/test',
      signature: '0'.repeat(64) })) as typeof fetch;
    await expect(new IyzicoProvider().createCheckout(input)).rejects.toThrow('verified');
  });

  it('confirms a signed, amount-matched result and rejects a mismatched amount', async () => {
    const result = { status: 'success', conversationId: input.id, token: 'checkout-token', basketId: input.id,
      paymentStatus: 'SUCCESS', paymentId: 'payment-1', currency: 'TRY', paidPrice: 125.5, price: 125.5,
      fraudStatus: 1 };
    global.fetch = jest.fn(async () => Response.json({ ...result, signature: sign(result.paymentStatus,
      result.paymentId, result.currency, result.basketId, result.conversationId, result.paidPrice,
      result.price, result.token) })) as typeof fetch;
    const provider = new IyzicoProvider();
    await expect(provider.verifyCheckout('checkout-token', input)).resolves.toEqual({
      status: 'succeeded', providerPaymentId: 'payment-1',
    });
    await expect(provider.verifyCheckout('checkout-token', { ...input, amountKurus: 12549 })).rejects.toThrow('verified');
    result.fraudStatus = 0;
    await expect(provider.verifyCheckout('checkout-token', input)).resolves.toEqual({
      status: 'pending', providerPaymentId: 'payment-1',
    });
  });

  it('normalizes trailing zeroes when comparing a response signature', () => {
    expect(verifyIyzicoSignature('sandbox-secret', ['SUCCESS', 'payment-1', 'TRY', 'basket-1', 'conversation-1',
      '10.5', '10.50', 'token-1'], sign('SUCCESS', 'payment-1', 'TRY', 'basket-1', 'conversation-1',
      '10.5', '10.5', 'token-1'))).toBe(true);
  });
});

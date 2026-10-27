import { createHmac } from 'node:crypto';
import { PaytrProvider, paytrBasket, paytrMerchantOid, paytrSessionId, paytrSign, verifyPaytrCallbackHash } from './paytr.provider';
import { CheckoutInput } from './payment-provider';

const credentials = { merchantId: '123456', merchantKey: 'merchant-key', merchantSalt: 'merchant-salt' };

const input: CheckoutInput = {
  id: '7c9e6679-7425-40de-944b-e07fc1f90ae7', amountKurus: 12550, source: 'saas_subscription', sourceId: 'order-1',
  callbackUrl: 'https://mainapi.odivon.com/api/v1/payments/callback/paytr/7c9e6679-7425-40de-944b-e07fc1f90ae7',
  buyer: { id: 'tenant-1', name: 'Ayşe', surname: 'Yılmaz', identityNumber: '11111111111',
    email: 'ayse@example.com', gsmNumber: '+905550000000', address: 'Test street 1',
    city: 'Istanbul', country: 'Turkey', ip: '127.0.0.1' },
};

describe('PaytrProvider', () => {
  const originalFetch = global.fetch;
  const originalMode = process.env.PAYTR_MODE;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalMode === undefined) delete process.env.PAYTR_MODE;
    else process.env.PAYTR_MODE = originalMode;
  });

  it('signs with HMAC-SHA256 keyed by the merchant key, base64 encoded', () => {
    const expected = createHmac('sha256', 'k').update('message').digest('base64');
    expect(paytrSign('k', 'message')).toBe(expected);
  });

  it('strips non-alphanumeric characters from merchant_oid', () => {
    expect(paytrMerchantOid(input.id)).toBe('7c9e6679742540de944be07fc1f90ae7');
  });

  it('maps merchant_oid back to the session UUID and rejects other values', () => {
    expect(paytrSessionId(paytrMerchantOid(input.id))).toBe(input.id);
    expect(paytrSessionId('not-a-session')).toBeNull();
  });

  it('encodes the basket as base64 JSON with a TL price string', () => {
    const basket = JSON.parse(Buffer.from(paytrBasket('Odivon', 12550), 'base64').toString('utf8'));
    expect(basket).toEqual([['Odivon', '125.50', 1]]);
  });

  it('accepts only the callback hash computed from merchant_oid, salt, status and total_amount', () => {
    const hash = paytrSign(credentials.merchantKey, '7c9e66797425' + credentials.merchantSalt + 'success' + '12550');
    const fields = { merchantOid: '7c9e66797425', status: 'success', totalAmount: '12550', hash };
    expect(verifyPaytrCallbackHash(credentials, fields)).toBe(true);
    expect(verifyPaytrCallbackHash(credentials, { ...fields, totalAmount: '99999' })).toBe(false);
    expect(verifyPaytrCallbackHash(credentials, { ...fields, hash: '' })).toBe(false);
    expect(verifyPaytrCallbackHash(credentials, { ...fields, hash: 'short' })).toBe(false);
  });

  it('requests an iFrame token with the documented hash and returns the PayTR page URL', async () => {
    process.env.PAYTR_MODE = 'sandbox';
    const fetchMock = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'success', token: 'iframe-token' }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await new PaytrProvider().createCheckout(input, credentials);

    expect(result).toEqual({ token: 'iframe-token', paymentPageUrl: 'https://www.paytr.com/odeme/guvenli/iframe-token' });
    const form = fetchMock.mock.calls[0][1].body as URLSearchParams;
    const basket = paytrBasket('saas_subscription', 12550);
    const expectedToken = paytrSign(credentials.merchantKey,
      '123456' + '127.0.0.1' + '7c9e6679742540de944be07fc1f90ae7' + 'ayse@example.com' + '12550' + basket + '1' + '0' + 'TL' + '1' +
      credentials.merchantSalt);
    expect(form.get('paytr_token')).toBe(expectedToken);
    expect(form.get('test_mode')).toBe('1');
    expect(form.get('payment_amount')).toBe('12550');
  });

  it('turns a rejected token request into a finance error', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'failed', reason: 'bad hash' }), { status: 200 })) as unknown as typeof fetch;
    await expect(new PaytrProvider().createCheckout(input, credentials)).rejects.toThrow('bad hash');
  });
});

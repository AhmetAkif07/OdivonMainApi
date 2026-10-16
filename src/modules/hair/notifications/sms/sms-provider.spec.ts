import { DisabledSmsProvider, NetgsmSmsProvider, smsProviderFromEnv } from './sms-provider';

describe('SMS providers', () => {
  it('picks Netgsm only when its credentials are in the environment', () => {
    expect(smsProviderFromEnv({})).toBeInstanceOf(DisabledSmsProvider);
    const netgsm = smsProviderFromEnv({ NETGSM_USERCODE: 'u', NETGSM_PASSWORD: 'p', NETGSM_HEADER: 'SALON' });
    expect(netgsm).toBeInstanceOf(NetgsmSmsProvider);
    expect(netgsm.isConfigured()).toBe(true);
    expect(smsProviderFromEnv({ SMS_PROVIDER: 'netgsm', NETGSM_USERCODE: 'u' }).isConfigured()).toBe(false);
  });

  it('posts one message to Netgsm REST v2 with basic auth', async () => {
    const http = jest.fn(async () => ({ ok: true, json: async () => ({ code: '00', jobid: 'J1' }) }));
    const provider = new NetgsmSmsProvider({ usercode: 'u', password: 'p', header: 'SALON' }, http as never);
    await expect(provider.send('+905321234567', 'Merhaba')).resolves.toEqual({ ok: true, providerMessageId: 'J1' });
    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.netgsm.com.tr/sms/rest/v2/send');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(JSON.parse(String(init.body))).toEqual({
      msgheader: 'SALON',
      encoding: 'TR',
      messages: [{ msg: 'Merhaba', no: '905321234567' }],
    });
  });

  it('reports Netgsm error codes without throwing', async () => {
    const http = jest.fn(async () => ({ ok: true, json: async () => ({ code: '30', description: 'invalid credentials' }) }));
    const provider = new NetgsmSmsProvider({ usercode: 'u', password: 'p', header: 'SALON' }, http as never);
    await expect(provider.send('+905321234567', 'x')).resolves.toMatchObject({ ok: false, error: expect.stringContaining('30') });
  });
});

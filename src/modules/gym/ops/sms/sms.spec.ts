import { NetgsmAdapter, SimulatorAdapter, getSmsAdapter } from './sms-adapters';

describe('Sms Adapters', () => {
  it('simulator adapter simulates sending correctly', async () => {
    const adapter = new SimulatorAdapter({});
    const res = await adapter.send({
      recipients: ['0555 123 45 67', '0544 987 65 43'],
      message: 'Merhaba test mesajı',
    });

    expect(res.success).toBe(true);
    expect(res.provider).toBe('simulator');
    expect(res.sentCount).toBe(2);
    expect(res.batchId).toMatch(/^SIM-/);

    const balance = await adapter.getBalance();
    expect(balance.success).toBe(true);
    expect(balance.balance).toBe(99999);
  });

  it('netgsm adapter validates credentials before network call', async () => {
    const adapter = new NetgsmAdapter({});
    const res = await adapter.send({
      recipients: ['05551234567'],
      message: 'Test',
    });
    expect(res.success).toBe(false);
    expect(res.message).toContain('Netgsm kullanıcı kodu veya şifresi eksik');
  });

  it('factory returns matching adapter', () => {
    const sim = getSmsAdapter('simulator', {});
    expect(sim instanceof SimulatorAdapter).toBe(true);

    const net = getSmsAdapter('netgsm', {});
    expect(net instanceof NetgsmAdapter).toBe(true);
  });
});

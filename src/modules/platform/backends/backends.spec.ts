import { FakeFirestore } from '../../../shared/testing/fake-firestore';
import { PlatformBackendsService, healthFromResponse, parseBackendTokens } from './backends.service';

const admin = { uid: 'admin1', email: 'admin@odivon.com' } as never;

function setup(fetchImpl: jest.Mock, tokens: Record<string, string> = { erp: 't'.repeat(40) }) {
  const db = new FakeFirestore();
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new PlatformBackendsService({ db } as never, audit as never);
  service.fetchImpl = fetchImpl as never;
  service.tokens = () => tokens;
  return { db, audit, service };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('backend helpers', () => {
  it('parses the token map defensively', () => {
    expect(parseBackendTokens(undefined)).toEqual({});
    expect(parseBackendTokens('nope')).toEqual({});
    expect(parseBackendTokens('{"erp":"x","bad":1}')).toEqual({ erp: 'x' });
  });

  it('maps responses to health', () => {
    expect(healthFromResponse(200, 100)).toBe('up');
    expect(healthFromResponse(200, 5000)).toBe('degraded');
    expect(healthFromResponse(404, 100)).toBe('degraded');
    expect(healthFromResponse(503, 100)).toBe('down');
  });
});

describe('PlatformBackendsService', () => {
  it('lists the built-in backends with their Firebase projects', async () => {
    const { service } = setup(jest.fn());
    const items = await service.listRegistry();
    expect(items.map((b) => [b.id, b.firebaseProjectId])).toEqual([
      ['main', 'odivon-main-api-a2095'],
      ['erp', 'odivonerp-38335'],
      ['school', 'odivonschool'],
      ['faturapro', 'generateinvoiceweb'],
    ]);
  });

  it('fetches remote tenants with the server-side token only', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      json({ items: [], summary: { total: 2, active: 1, suspended: 1, closed: 0, members: 3 }, generatedAt: 'x' }),
    );
    const { service } = setup(fetchImpl);
    const result = await service.remoteTenants('erp');
    expect(result.summary.total).toBe(2);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://apierp.odivon.com/internal/platform/tenants');
    expect(fetchImpl.mock.calls[0][1].headers.authorization).toBe(`Bearer ${'t'.repeat(40)}`);
  });

  it('refuses remote calls when no token is configured', async () => {
    const { service } = setup(jest.fn(), {});
    await expect(service.remoteTenants('erp')).rejects.toThrow('PLATFORM_BACKEND_TOKENS');
  });

  it('marks an unreachable API as down and stores the last check', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { service, db } = setup(fetchImpl);
    const erp = (await service.listRegistry()).find((b) => b.id === 'erp')!;
    const check = await service.check(erp);
    expect(check.status).toBe('down');
    expect(check.tenantsError).toBe('ECONNREFUSED');
    expect(db).toBeDefined();
  });

  it('changes a remote tenant status and writes an audit log', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(json({ id: 't1', status: 'suspended' }));
    const { service, audit } = setup(fetchImpl);
    await service.setRemoteTenantStatus('erp', 't1', { status: 'suspended', reason: 'ödeme' }, admin);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://apierp.odivon.com/internal/platform/tenants/t1/status');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'backend.tenant.status', targetId: 'erp/t1' }));
  });

  it('adds a custom backend and resets a built-in one', async () => {
    const { service } = setup(jest.fn());
    const created = await service.upsert('pairly', { name: 'Pairly', healthUrl: 'https://pairly.example.com/health' }, admin);
    expect(created.builtIn).toBe(false);
    await service.upsert('erp', { name: 'ERP (yeni ad)' }, admin);
    expect((await service.get('erp')).name).toBe('ERP (yeni ad)');
    await service.remove('erp', admin);
    expect((await service.get('erp')).name).toBe('Odivon ERP');
  });
});

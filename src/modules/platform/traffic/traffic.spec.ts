import {
  AnalyticsEngineDataset,
  TRAFFIC_TAG_HEADER,
  normalizeRoute,
  recordTraffic,
  routeSegment,
} from '../../../shared/http/traffic-metrics';
import { trafficTag } from './traffic-tag.interceptor';
import { aeTime, fillBuckets, PlatformTrafficService } from './traffic.service';

function dataset() {
  const points: Array<{ indexes?: string[]; blobs?: (string | null)[]; doubles?: number[] }> = [];
  const ds: AnalyticsEngineDataset = { writeDataPoint: (p) => points.push(p) };
  return { ds, points };
}

describe('traffic metrics', () => {
  it('normalizes ids out of routes', () => {
    expect(normalizeRoute('/api/v1/gym/members/Ab12CdEf34/payments')).toBe('/gym/members/:id/payments');
    expect(normalizeRoute('/api/v1/platform/stale-profiles/cleanup')).toBe('/platform/stale-profiles/cleanup');
    expect(normalizeRoute('/api/v1/vet/patients/123')).toBe('/vet/patients/:id');
    expect(normalizeRoute('/health')).toBe('/health');
    expect(routeSegment('/api/v1/driving-school/students')).toBe('driving-school');
    expect(routeSegment('/health')).toBe('');
  });

  it('writes a point and strips the internal tag header', () => {
    const { ds, points } = dataset();
    const request = new Request('https://mainapi.odivon.com/api/v1/gym/members/Xy9', {
      headers: { origin: 'https://gym.odivon.com' },
    });
    const response = new Response('{}', {
      status: 201,
      headers: { [TRAFFIC_TAG_HEADER]: 't1|gym', 'content-length': '2' },
    });
    const out = recordTraffic(ds, request, response, 1000, 1042);
    expect(out.headers.get(TRAFFIC_TAG_HEADER)).toBeNull();
    expect(out.status).toBe(201);
    expect(points).toHaveLength(1);
    expect(points[0].indexes).toEqual(['t1']);
    expect(points[0].blobs).toEqual(['GET', '/gym/members/:id', 'gym', 't1', '', '', '2xx', 'gym.odivon.com']);
    expect(points[0].doubles).toEqual([201, 42, 2]);
  });

  it('skips preflights and works without a binding', () => {
    const { ds, points } = dataset();
    recordTraffic(ds, new Request('https://x/api/v1/gym', { method: 'OPTIONS' }), new Response(null, { status: 204 }), 0);
    expect(points).toHaveLength(0);
    const res = new Response('ok');
    expect(recordTraffic(undefined, new Request('https://x/'), res, 0)).toBe(res);
  });

  it('tags tenant requests with their product', () => {
    expect(trafficTag({ currentUser: { tenantId: 't1', modules: ['vet'] }, originalUrl: '/api/v1/identity/me' } as never)).toBe('t1|vet');
    expect(trafficTag({ currentUser: { tenantId: 't1', modules: ['vet', 'gym'] }, originalUrl: '/api/v1/gym/x' } as never)).toBe('t1|gym');
    expect(trafficTag({ originalUrl: '/api/v1/gym/x' } as never)).toBeNull();
  });
});

describe('PlatformTrafficService', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    jest.restoreAllMocks();
  });

  it('parses Analytics Engine times and zero-fills buckets', () => {
    expect(aeTime('2026-11-26 23:50:00')).toBe('2026-11-26T23:50:00.000Z');
    const now = Date.parse('2026-11-26T23:50:05Z');
    const buckets = fillBuckets([{ t: '2026-11-26 23:50:00', requests: '4', e4: 1, e5: 0, sumMs: 80 }], 60, 10, now);
    expect(buckets).toHaveLength(6);
    expect(buckets.at(-1)).toEqual({ t: '2026-11-26T23:50:00.000Z', requests: 4, errors4xx: 1, errors5xx: 0, avgMs: 20 });
    expect(buckets[0].requests).toBe(0);
  });

  it('reports missing configuration', async () => {
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_ANALYTICS_TOKEN;
    const service = new PlatformTrafficService({} as never);
    expect(service.status().configured).toBe(false);
    await expect(service.live()).rejects.toThrow(/yapılandırılmamış/);
  });

  it('builds the live view from SQL API rows', async () => {
    process.env.CF_ACCOUNT_ID = 'acc';
    process.env.CF_ANALYTICS_TOKEN = 'tok';
    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      const sql = String(init?.body);
      const data = sql.includes('toStartOfInterval')
        ? []
        : [{ at: '2026-11-26 23:50:01', method: 'GET', route: '/gym/x', module: 'gym', tenantId: 't1', country: 'TR', status: 200, ms: 31 }];
      return new Response(JSON.stringify({ data }), { status: 200 });
    });
    const db = {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      getAll: async (...refs: Array<{ id: string }>) => refs.map((r) => ({ id: r.id, exists: true, data: () => ({ name: 'Salon' }) })),
    };
    const service = new PlatformTrafficService({ db } as never);
    const live = await service.live();
    expect(live.series).toHaveLength(30);
    expect(live.recent[0]).toMatchObject({ route: '/gym/x', tenantName: 'Salon', status: 200, durationMs: 31 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/accounts/acc/analytics_engine/sql');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('explains an unauthorized token', async () => {
    process.env.CF_ACCOUNT_ID = 'acc';
    process.env.CF_ANALYTICS_TOKEN = 'bad';
    jest.spyOn(global, 'fetch').mockImplementation(async () => new Response('no', { status: 403 }));
    const service = new PlatformTrafficService({} as never);
    await expect(service.live()).rejects.toThrow(/Account Analytics/);
  });
});

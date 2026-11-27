/**
 * Per-request traffic metrics for the panel's "Trafik Analizi" screen.
 *
 * The Worker entry (worker/index.mjs) times every request and hands it to `recordTraffic`, which
 * writes one data point to Cloudflare Workers Analytics Engine (binding TRAFFIC in wrangler.jsonc).
 * Writing is fire-and-forget: no subrequest, no await, no Firestore cost. The platform traffic
 * endpoints read the points back with the Analytics Engine SQL API.
 *
 * Nest knows the tenant only after the auth guard ran, so TrafficTagInterceptor puts it in the
 * internal TRAFFIC_TAG_HEADER response header; this function reads it and strips it again.
 */

/** Cloudflare Workers Analytics Engine dataset binding. */
export interface AnalyticsEngineDataset {
  writeDataPoint(point: { indexes?: string[]; blobs?: (string | null)[]; doubles?: number[] }): void;
}

/** Internal response header: `<tenantId>|<module>`. Never leaves the Worker. */
export const TRAFFIC_TAG_HEADER = 'x-odv-traffic';

/**
 * Data point layout (keep in sync with platform/traffic/traffic.service.ts queries):
 * index1 tenantId (or module, or "-")
 * blob1 method, blob2 route pattern, blob3 module/route segment, blob4 tenantId, blob5 country,
 * blob6 Cloudflare colo, blob7 status class (2xx…), blob8 calling app host (Origin)
 * double1 status, double2 duration ms, double3 response bytes (Content-Length, 0 if unknown)
 */
export interface TrafficPoint {
  method: string;
  route: string;
  module: string;
  tenantId: string;
  country: string;
  colo: string;
  status: number;
  durationMs: number;
  bytes: number;
  origin: string;
}

const API_PREFIX = /^\/api\/v\d+(?=\/|$)/;
const MAX_SEGMENTS = 6;

/** A path segment that is an id, not a route word (route words are lowercase letters and dashes). */
function isIdSegment(segment: string): boolean {
  return /\d/.test(segment) || /[A-Z]/.test(segment) || /[@.:=%]/.test(segment) || segment.length > 32;
}

/** `/api/v1/gym/members/Ab12Cd/payments?x=1` -> `/gym/members/:id/payments`. */
export function normalizeRoute(pathname: string): string {
  const path = pathname.replace(API_PREFIX, '');
  const segments = path.split('/').filter(Boolean);
  const kept = segments.slice(0, MAX_SEGMENTS).map((s) => (isIdSegment(s) ? ':id' : s.toLowerCase()));
  if (segments.length > MAX_SEGMENTS) kept.push('…');
  return `/${kept.join('/')}`.slice(0, 200);
}

/** First segment after /api/v1 (gym, vet, platform, identity…), else "" for non-API paths. */
export function routeSegment(pathname: string): string {
  if (!API_PREFIX.test(pathname)) return '';
  const segment = pathname.replace(API_PREFIX, '').split('/').filter(Boolean)[0] ?? '';
  return isIdSegment(segment) ? '' : segment.toLowerCase();
}

function originHost(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(value).host.slice(0, 100);
  } catch {
    return '';
  }
}

export function statusClass(status: number): string {
  return `${Math.floor(status / 100)}xx`;
}

export function buildTrafficPoint(
  request: Request,
  status: number,
  durationMs: number,
  bytes: number,
  tag: string | null,
): TrafficPoint {
  const url = new URL(request.url);
  const [tenantId = '', taggedModule = ''] = (tag ?? '').split('|');
  const cf = (request as Request & { cf?: { country?: string; colo?: string } }).cf;
  return {
    method: request.method.toUpperCase(),
    route: normalizeRoute(url.pathname),
    module: taggedModule || routeSegment(url.pathname),
    tenantId: tenantId.slice(0, 64),
    country: cf?.country ?? '',
    colo: cf?.colo ?? '',
    status,
    durationMs: Math.max(0, Math.round(durationMs)),
    bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : 0,
    origin: originHost(request.headers.get('origin')),
  };
}

export function writeTrafficPoint(dataset: AnalyticsEngineDataset, point: TrafficPoint): void {
  dataset.writeDataPoint({
    indexes: [point.tenantId || point.module || '-'],
    blobs: [
      point.method,
      point.route,
      point.module,
      point.tenantId,
      point.country,
      point.colo,
      statusClass(point.status),
      point.origin,
    ],
    doubles: [point.status, point.durationMs, point.bytes],
  });
}

/**
 * Called by the Worker for every response. Returns the response to send (the internal tag header
 * removed). Never throws: metrics must not affect a request.
 */
export function recordTraffic(
  dataset: AnalyticsEngineDataset | undefined,
  request: Request,
  response: Response,
  startedAt: number,
  now: number = Date.now(),
): Response {
  let outgoing = response;
  try {
    const tag = response.headers.get(TRAFFIC_TAG_HEADER);
    if (tag !== null) {
      outgoing = new Response(response.body, response);
      outgoing.headers.delete(TRAFFIC_TAG_HEADER);
    }
    // CORS preflights double every browser call without telling anything about the API.
    if (!dataset || request.method === 'OPTIONS') return outgoing;
    const bytes = Number(response.headers.get('content-length') ?? 0);
    writeTrafficPoint(dataset, buildTrafficPoint(request, response.status, now - startedAt, bytes, tag));
  } catch {
    // Metrics must never affect the request.
  }
  return outgoing;
}

/** For a request that threw before a response existed (the Worker then answers 500). */
export function recordTrafficFailure(
  dataset: AnalyticsEngineDataset | undefined,
  request: Request,
  startedAt: number,
  now: number = Date.now(),
): void {
  try {
    if (dataset) writeTrafficPoint(dataset, buildTrafficPoint(request, 500, now - startedAt, 0, null));
  } catch {
    // ignore
  }
}

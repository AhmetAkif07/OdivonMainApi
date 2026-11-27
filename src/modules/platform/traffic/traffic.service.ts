import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import {
  CF_API_BASE,
  TRAFFIC_LIVE,
  TRAFFIC_RANGES,
  TrafficConfig,
  TrafficRange,
  trafficConfig,
} from './traffic.config';

type Row = Record<string, string | number | null>;

export interface TrafficBucket {
  t: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  avgMs: number;
}

export interface TrafficGroup {
  key: string;
  label?: string;
  requests: number;
  errors4xx: number;
  errors5xx: number;
  avgMs: number;
}

export interface TrafficRouteGroup extends TrafficGroup {
  method: string;
  route: string;
}

export interface TrafficRecentRequest {
  at: string;
  method: string;
  route: string;
  module: string;
  tenantId: string;
  tenantName: string | null;
  country: string;
  status: number;
  durationMs: number;
}

const QUERY_TIMEOUT_MS = 10_000;
const OVERVIEW_CACHE_MS = 30_000;
const LIVE_CACHE_MS = 4_000;
const NAME_CACHE_MS = 10 * 60_000;

/** Sample-weighted aggregates (Analytics Engine may sample busy indexes). */
const W = '_sample_interval';
const AGG = [
  `SUM(${W}) AS requests`,
  `SUM(${W} * if(double1 >= 400 AND double1 < 500, 1, 0)) AS e4`,
  `SUM(${W} * if(double1 >= 500, 1, 0)) AS e5`,
  `SUM(${W} * double2) AS sumMs`,
].join(', ');

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

/** Analytics Engine returns "2026-11-26 23:50:00" (UTC). */
export function aeTime(value: unknown): string {
  const s = str(value);
  if (!s) return '';
  const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function toGroup(row: Row, key: string): TrafficGroup {
  const requests = num(row.requests);
  return {
    key,
    requests: Math.round(requests),
    errors4xx: Math.round(num(row.e4)),
    errors5xx: Math.round(num(row.e5)),
    avgMs: requests > 0 ? Math.round(num(row.sumMs) / requests) : 0,
  };
}

/** Zero-filled, epoch-aligned buckets (same alignment as toStartOfInterval). */
export function fillBuckets(rows: Row[], seconds: number, bucket: number, now = Date.now()): TrafficBucket[] {
  const byTime = new Map<number, Row>();
  for (const row of rows) {
    const t = Date.parse(aeTime(row.t));
    if (!Number.isNaN(t)) byTime.set(Math.floor(t / 1000 / bucket) * bucket, row);
  }
  const end = Math.floor(now / 1000 / bucket) * bucket;
  const start = Math.floor((now / 1000 - seconds) / bucket) * bucket + bucket;
  const out: TrafficBucket[] = [];
  for (let t = start; t <= end; t += bucket) {
    const g = toGroup(byTime.get(t) ?? {}, '');
    out.push({ t: new Date(t * 1000).toISOString(), requests: g.requests, errors4xx: g.errors4xx, errors5xx: g.errors5xx, avgMs: g.avgMs });
  }
  return out;
}

@Injectable()
export class PlatformTrafficService {
  private readonly logger = new Logger(PlatformTrafficService.name);
  private readonly cache = new Map<string, { at: number; value: Promise<unknown> }>();
  private readonly names = new Map<string, { at: number; name: string | null }>();

  constructor(private readonly firebase: FirebaseService) {}

  status() {
    const cfg = trafficConfig();
    return {
      configured: Boolean(cfg.accountId && cfg.token),
      accountIdSet: Boolean(cfg.accountId),
      tokenSet: Boolean(cfg.token),
      dataset: cfg.dataset,
      script: cfg.script,
      ranges: Object.keys(TRAFFIC_RANGES),
    };
  }

  overview(range: TrafficRange) {
    return this.cached(`overview:${range}`, OVERVIEW_CACHE_MS, () => this.buildOverview(range));
  }

  live() {
    return this.cached('live', LIVE_CACHE_MS, () => this.buildLive());
  }

  cloudflare(range: TrafficRange) {
    return this.cached(`cf:${range}`, OVERVIEW_CACHE_MS, () => this.buildCloudflare(range));
  }

  // ---------------------------------------------------------------- builders

  private async buildOverview(range: TrafficRange) {
    const cfg = this.requireConfig();
    const { seconds, bucket } = TRAFFIC_RANGES[range];
    const ds = cfg.dataset;
    const where = `timestamp > NOW() - INTERVAL '${seconds}' SECOND`;
    const q = (sql: string) => this.sql(cfg, sql);

    const [totals, series, statuses, routes, tenants, modules, countries, origins, latency] = await Promise.all([
      q(`SELECT ${AGG}, SUM(${W} * double3) AS bytes FROM ${ds} WHERE ${where}`),
      q(`SELECT toStartOfInterval(timestamp, INTERVAL '${bucket}' SECOND) AS t, ${AGG} FROM ${ds} WHERE ${where} GROUP BY t ORDER BY t ASC`),
      q(`SELECT double1 AS status, SUM(${W}) AS requests FROM ${ds} WHERE ${where} GROUP BY status ORDER BY requests DESC LIMIT 20`),
      q(`SELECT blob1 AS method, blob2 AS route, ${AGG} FROM ${ds} WHERE ${where} GROUP BY method, route ORDER BY requests DESC LIMIT 60`),
      q(`SELECT blob4 AS k, ${AGG} FROM ${ds} WHERE ${where} AND blob4 != '' GROUP BY k ORDER BY requests DESC LIMIT 10`),
      q(`SELECT blob3 AS k, ${AGG} FROM ${ds} WHERE ${where} GROUP BY k ORDER BY requests DESC LIMIT 25`),
      q(`SELECT blob5 AS k, ${AGG} FROM ${ds} WHERE ${where} GROUP BY k ORDER BY requests DESC LIMIT 12`),
      q(`SELECT blob8 AS k, ${AGG} FROM ${ds} WHERE ${where} GROUP BY k ORDER BY requests DESC LIMIT 12`),
      // Quantiles are a separate query so a function the SQL API rejects only blanks these numbers.
      q(
        `SELECT quantileExactWeighted(0.5)(double2, ${W}) AS p50, quantileExactWeighted(0.95)(double2, ${W}) AS p95, ` +
          `quantileExactWeighted(0.99)(double2, ${W}) AS p99 FROM ${ds} WHERE ${where}`,
      ).catch((error: unknown) => {
        this.logger.warn(`Traffic latency quantiles failed: ${(error as Error).message}`);
        return null;
      }),
    ]);

    const total = toGroup(totals[0] ?? {}, 'total');
    const routeGroups: TrafficRouteGroup[] = routes.map((r) => ({
      ...toGroup(r, `${str(r.method)} ${str(r.route)}`),
      method: str(r.method),
      route: str(r.route),
    }));
    const tenantGroups = tenants.map((r) => toGroup(r, str(r.k)));
    const tenantNames = await this.tenantNames(tenantGroups.map((g) => g.key));
    for (const g of tenantGroups) g.label = tenantNames.get(g.key) ?? undefined;
    const l = latency?.[0];

    return {
      range,
      bucketSeconds: bucket,
      generatedAt: new Date().toISOString(),
      totals: {
        requests: total.requests,
        errors4xx: total.errors4xx,
        errors5xx: total.errors5xx,
        avgMs: total.avgMs,
        bytes: Math.round(num(totals[0]?.bytes)),
        p50Ms: l ? Math.round(num(l.p50)) : null,
        p95Ms: l ? Math.round(num(l.p95)) : null,
        p99Ms: l ? Math.round(num(l.p99)) : null,
        requestsPerSecond: total.requests / seconds,
      },
      series: fillBuckets(series, seconds, bucket),
      statuses: statuses.map((r) => ({ status: Math.round(num(r.status)), requests: Math.round(num(r.requests)) })),
      routes: routeGroups.slice(0, 15),
      slowRoutes: routeGroups
        .filter((g) => g.requests >= 3)
        .sort((a, b) => b.avgMs - a.avgMs)
        .slice(0, 10),
      errorRoutes: routeGroups
        .filter((g) => g.errors5xx + g.errors4xx > 0)
        .sort((a, b) => b.errors5xx - a.errors5xx || b.errors4xx - a.errors4xx)
        .slice(0, 10),
      tenants: tenantGroups,
      modules: modules.map((r) => toGroup(r, str(r.k))),
      countries: countries.map((r) => toGroup(r, str(r.k))),
      origins: origins.map((r) => toGroup(r, str(r.k))),
    };
  }

  private async buildLive() {
    const cfg = this.requireConfig();
    const ds = cfg.dataset;
    const { seconds, bucket, recent } = TRAFFIC_LIVE;
    const where = `timestamp > NOW() - INTERVAL '${seconds}' SECOND`;
    const [series, rows] = await Promise.all([
      this.sql(cfg, `SELECT toStartOfInterval(timestamp, INTERVAL '${bucket}' SECOND) AS t, ${AGG} FROM ${ds} WHERE ${where} GROUP BY t ORDER BY t ASC`),
      this.sql(
        cfg,
        `SELECT timestamp AS at, blob1 AS method, blob2 AS route, blob3 AS module, blob4 AS tenantId, blob5 AS country, ` +
          `double1 AS status, double2 AS ms FROM ${ds} WHERE ${where} ORDER BY timestamp DESC LIMIT ${recent}`,
      ),
    ]);
    const names = await this.tenantNames(rows.map((r) => str(r.tenantId)));
    const requests: TrafficRecentRequest[] = rows.map((r) => ({
      at: aeTime(r.at),
      method: str(r.method),
      route: str(r.route),
      module: str(r.module),
      tenantId: str(r.tenantId),
      tenantName: names.get(str(r.tenantId)) ?? null,
      country: str(r.country),
      status: Math.round(num(r.status)),
      durationMs: Math.round(num(r.ms)),
    }));
    return {
      generatedAt: new Date().toISOString(),
      windowSeconds: seconds,
      bucketSeconds: bucket,
      series: fillBuckets(series, seconds, bucket),
      recent: requests,
    };
  }

  private async buildCloudflare(range: TrafficRange) {
    const cfg = this.requireConfig();
    const end = new Date();
    const start = new Date(end.getTime() - TRAFFIC_RANGES[range].seconds * 1000);
    const query = `query ($account: string!, $script: string!, $start: Time!, $end: Time!) {
  viewer {
    accounts(filter: { accountTag: $account }) {
      totals: workersInvocationsAdaptive(limit: 1, filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }) {
        sum { requests errors subrequests }
        quantiles { cpuTimeP50 cpuTimeP99 }
      }
      byStatus: workersInvocationsAdaptive(limit: 20, filter: { scriptName: $script, datetime_geq: $start, datetime_leq: $end }) {
        sum { requests errors }
        dimensions { status }
      }
    }
  }
}`;
    const body = await this.cfFetch(cfg, '/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { account: cfg.accountId, script: cfg.script, start: start.toISOString(), end: end.toISOString() },
      }),
    });
    const parsed = JSON.parse(body) as {
      data?: { viewer?: { accounts?: Array<{ totals?: any[]; byStatus?: any[] }> } };
      errors?: Array<{ message?: string }> | null;
    };
    if (parsed.errors?.length) {
      throw new AppException(
        ErrorCode.TRAFFIC_ANALYTICS_UPSTREAM_ERROR,
        `Cloudflare GraphQL: ${parsed.errors.map((e) => e.message).join('; ').slice(0, 300)}`,
      );
    }
    const account = parsed.data?.viewer?.accounts?.[0];
    const totals = account?.totals?.[0];
    return {
      range,
      script: cfg.script,
      generatedAt: end.toISOString(),
      requests: Math.round(num(totals?.sum?.requests)),
      errors: Math.round(num(totals?.sum?.errors)),
      subrequests: Math.round(num(totals?.sum?.subrequests)),
      // GraphQL reports CPU time in microseconds.
      cpuP50Ms: totals?.quantiles ? num(totals.quantiles.cpuTimeP50) / 1000 : null,
      cpuP99Ms: totals?.quantiles ? num(totals.quantiles.cpuTimeP99) / 1000 : null,
      byStatus: (account?.byStatus ?? [])
        .map((r: any) => ({ status: str(r?.dimensions?.status), requests: Math.round(num(r?.sum?.requests)) }))
        .sort((a: { requests: number }, b: { requests: number }) => b.requests - a.requests),
    };
  }

  // ---------------------------------------------------------------- helpers

  private requireConfig(): TrafficConfig {
    const cfg = trafficConfig();
    if (!cfg.accountId || !cfg.token) {
      throw new AppException(
        ErrorCode.TRAFFIC_ANALYTICS_NOT_CONFIGURED,
        'Trafik analizi yapılandırılmamış: CF_ACCOUNT_ID ve CF_ANALYTICS_TOKEN gerekli.',
      );
    }
    return cfg;
  }

  /** Concurrent and repeated panel polls share one upstream call per window. */
  private cached<T>(key: string, ttl: number, build: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value as Promise<T>;
    const value = build();
    this.cache.set(key, { at: Date.now(), value });
    value.catch(() => this.cache.delete(key));
    return value;
  }

  private async sql(cfg: TrafficConfig, sql: string): Promise<Row[]> {
    const text = await this.cfFetch(cfg, `/accounts/${encodeURIComponent(cfg.accountId)}/analytics_engine/sql`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `${sql} FORMAT JSON`,
    });
    try {
      const parsed = JSON.parse(text) as { data?: Row[] };
      return Array.isArray(parsed.data) ? parsed.data : [];
    } catch {
      throw new AppException(ErrorCode.TRAFFIC_ANALYTICS_UPSTREAM_ERROR, `Analytics Engine: ${text.slice(0, 300)}`);
    }
  }

  private async cfFetch(cfg: TrafficConfig, path: string, init: RequestInit): Promise<string> {
    let res: Response;
    try {
      res = await fetch(`${CF_API_BASE}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${cfg.token}` },
        signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
      });
    } catch (error) {
      throw new AppException(
        ErrorCode.TRAFFIC_ANALYTICS_UPSTREAM_ERROR,
        `Cloudflare API'ye ulaşılamadı: ${(error as Error).message}`,
      );
    }
    const text = await res.text();
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? ' (CF_ANALYTICS_TOKEN geçersiz ya da "Account Analytics: Read" izni yok)'
          : '';
      throw new AppException(
        ErrorCode.TRAFFIC_ANALYTICS_UPSTREAM_ERROR,
        `Cloudflare API ${res.status}${hint}: ${text.slice(0, 300)}`,
      );
    }
    return text;
  }

  /** Tenant display names, cached per isolate so the 5 s live poll does not re-read Firestore. */
  private async tenantNames(ids: string[]): Promise<Map<string, string | null>> {
    const now = Date.now();
    const out = new Map<string, string | null>();
    const missing: string[] = [];
    for (const id of new Set(ids.filter(Boolean))) {
      const hit = this.names.get(id);
      if (hit && now - hit.at < NAME_CACHE_MS) out.set(id, hit.name);
      else missing.push(id);
    }
    if (missing.length) {
      try {
        const col = this.firebase.db.collection(ROOT_COLLECTION.tenants);
        const snaps = await this.firebase.db.getAll(...missing.slice(0, 50).map((id) => col.doc(id)));
        for (const snap of snaps) {
          const name = snap.exists ? ((snap.data()?.name as string | undefined) ?? null) : null;
          this.names.set(snap.id, { at: now, name });
          out.set(snap.id, name);
        }
      } catch (error) {
        this.logger.warn(`Traffic tenant names failed: ${(error as Error).message}`);
      }
    }
    return out;
  }
}

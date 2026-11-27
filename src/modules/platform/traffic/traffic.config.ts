/**
 * Trafik Analizi configuration. Data comes from Cloudflare:
 * - Workers Analytics Engine dataset written by the Worker for every request (binding TRAFFIC).
 * - Workers GraphQL analytics (invocations, CPU time) for the Worker script.
 *
 * Both are read with one API token that has "Account > Account Analytics > Read":
 *   npx wrangler secret put CF_ANALYTICS_TOKEN
 * CF_ACCOUNT_ID / TRAFFIC_DATASET / CF_WORKER_SCRIPT are plain vars in wrangler.jsonc.
 */
export const TRAFFIC_DEFAULT_DATASET = 'odivon_api_traffic';
export const TRAFFIC_DEFAULT_SCRIPT = 'odivon-main-api';
export const CF_API_BASE = 'https://api.cloudflare.com/client/v4';

export interface TrafficConfig {
  accountId: string;
  token: string;
  dataset: string;
  script: string;
}

export function trafficConfig(): TrafficConfig {
  const dataset = process.env.TRAFFIC_DATASET?.trim() || TRAFFIC_DEFAULT_DATASET;
  return {
    accountId: process.env.CF_ACCOUNT_ID?.trim() ?? '',
    token: process.env.CF_ANALYTICS_TOKEN?.trim() ?? '',
    // Goes into SQL text, so only a plain identifier is accepted.
    dataset: /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(dataset) ? dataset : TRAFFIC_DEFAULT_DATASET,
    script: process.env.CF_WORKER_SCRIPT?.trim() || TRAFFIC_DEFAULT_SCRIPT,
  };
}

/** Selectable ranges: window length and chart bucket size, in seconds. */
export const TRAFFIC_RANGES = {
  '15m': { seconds: 15 * 60, bucket: 30 },
  '1h': { seconds: 60 * 60, bucket: 60 },
  '6h': { seconds: 6 * 3600, bucket: 5 * 60 },
  '24h': { seconds: 24 * 3600, bucket: 15 * 60 },
  '7d': { seconds: 7 * 86400, bucket: 3600 },
  '30d': { seconds: 30 * 86400, bucket: 6 * 3600 },
} as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;

export function parseRange(value: string | undefined): TrafficRange {
  return value && value in TRAFFIC_RANGES ? (value as TrafficRange) : '24h';
}

/** Live view: last 5 minutes in 10 s buckets. */
export const TRAFFIC_LIVE = { seconds: 300, bucket: 10, recent: 40 } as const;

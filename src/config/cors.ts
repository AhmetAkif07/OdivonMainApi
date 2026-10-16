/**
 * Browser origins of the Odivon clients that call this API. Requests without an Origin header
 * (mobile apps, server-to-server, curl) are not affected by CORS and are always let through.
 * `CORS_ORIGIN` (comma separated) adds origins on top of these; there is no wildcard.
 */
export const DEFAULT_CORS_ORIGINS: readonly string[] = [
  'https://hair.odivon.com',
  'https://gym.odivon.com',
  'https://vet.odivon.com',
  'https://spa.odivon.com',
  'https://rent.odivon.com',
  'https://admin.odivon.com',
  'https://odivon-main-api-a2095.web.app',
  'https://odivon-main-api-a2095.firebaseapp.com',
  'https://odivonfarm.web.app',
  'https://odivonprohair.dogangns-98.workers.dev',
  'https://odivon-gym-client.dogangns-98.workers.dev',
  'https://odivon-panel.dogangns-98.workers.dev',
  'https://odivonapm.dogangns-98.workers.dev',
  'https://odivonvetclient.dogangns-98.workers.dev',
  'https://odivon-management.dogangns-98.workers.dev',
  'https://odivon-rentacar.dogangns-98.workers.dev',
];

/** Local dev servers (`ng serve` on :4200 and friends) on any port. */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export function allowedCorsOrigins(configured: string | undefined): Set<string> {
  const extra = (configured ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin && origin !== '*');
  return new Set([...DEFAULT_CORS_ORIGINS, ...extra]);
}

export function isCorsOriginAllowed(origin: string | undefined, allowed: Set<string>): boolean {
  if (!origin) return true;
  return LOCAL_ORIGIN.test(origin) || allowed.has(origin);
}

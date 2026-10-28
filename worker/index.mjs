import { httpServerHandler } from 'cloudflare:node';
import { env, waitUntil } from 'cloudflare:workers';
import './firestore-startup.mjs';

const configured = Boolean(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
// Secret-free PR previews intentionally stay lightweight and return 503. Deferring the large
// Nest bundle keeps those validation deployments below Cloudflare's startup CPU limit.
const bootstrapModule = configured ? (await import('../dist/bootstrap.js')).default : null;
/** Must match the hourly entry in wrangler.jsonc `triggers.crons`. */
const HAIR_HOURLY_CRON = '15 * * * *';

// Nest starts on the first request or cron of an isolate, not during isolate startup. Startup is
// capped at 1 s of CPU on every plan (deploy error 10021) and grows with each route; a request
// has 30 s on the Paid plan. Concurrent first requests share one start; a failed start is retried.
let ready = null;
function start() {
  ready ??= bootstrapModule
    .bootstrap({ swaggerUi: false, startupLogs: false, waitUntil })
    .then(() => httpServerHandler({ port: 3000 }))
    .catch((error) => {
      ready = null;
      throw error;
    });
  return ready;
}

export default {
  async fetch(request, env, ctx) {
    if (!configured) {
      return Response.json(
        { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Service configuration is incomplete' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const handler = await start();
    return handler.fetch(request, env, ctx);
  },

  // Crons (wrangler.jsonc triggers): the hourly one runs hair reminders / package expiry; the daily
  // one runs membership, overdue-installment and absence reminders.
  async scheduled(controller, env, ctx) {
    if (!bootstrapModule) return;
    ctx.waitUntil(
      start().then(() =>
        controller.cron === HAIR_HOURLY_CRON ? bootstrapModule.runHairJobs() : bootstrapModule.runScheduledJobs(),
      ),
    );
  },
};

import { httpServerHandler } from 'cloudflare:node';
import { env, waitUntil } from 'cloudflare:workers';
import './firestore-startup.mjs';

// Initialize Nest during isolate startup, outside the Free plan request CPU budget.
const configured = Boolean(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
// Secret-free PR previews intentionally stay lightweight and return 503. Deferring the large
// Nest bundle keeps those validation deployments below Cloudflare's startup CPU limit.
const bootstrapModule = configured ? (await import('../dist/bootstrap.js')).default : null;
if (bootstrapModule) await bootstrapModule.bootstrap({ swaggerUi: false, startupLogs: false, waitUntil });
const handler = httpServerHandler({ port: 3000 });
/** Must match the hourly entry in wrangler.jsonc `triggers.crons`. */
const HAIR_HOURLY_CRON = '15 * * * *';

export default {
  async fetch(request, env, ctx) {
    if (!configured) {
      return Response.json(
        { success: false, error: { code: 'SERVICE_UNAVAILABLE', message: 'Service configuration is incomplete' } },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return handler.fetch(request, env, ctx);
  },

  // Crons (wrangler.jsonc triggers): the hourly one runs hair reminders / package expiry; the daily
  // one runs membership, overdue-installment and absence reminders.
  async scheduled(controller, env, ctx) {
    if (!bootstrapModule) return;
    ctx.waitUntil(
      controller.cron === HAIR_HOURLY_CRON ? bootstrapModule.runHairJobs() : bootstrapModule.runScheduledJobs(),
    );
  },
};

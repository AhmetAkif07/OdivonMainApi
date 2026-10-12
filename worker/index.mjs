import { httpServerHandler } from 'cloudflare:node';
import { env } from 'cloudflare:workers';
import './firestore-startup.mjs';
import bootstrapModule from '../dist/bootstrap.js';

// Initialize Nest during isolate startup, outside the Free plan request CPU budget.
const configured = Boolean(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY);
if (configured) await bootstrapModule.bootstrap({ swaggerUi: false, startupLogs: false });
const handler = httpServerHandler({ port: 3000 });

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

  // Daily cron (wrangler.jsonc triggers): membership, overdue-installment and absence reminders.
  async scheduled(controller, env, ctx) {
    if (!configured) return;
    ctx.waitUntil(bootstrapModule.runScheduledJobs());
  },
};

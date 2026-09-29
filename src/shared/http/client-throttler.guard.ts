import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Rate-limits per real client address. On Cloudflare Workers `req.ip` is not the caller, so
 * without this every client would share one bucket; Cloudflare sets `cf-connecting-ip`.
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return clientAddress(req);
  }
}

export function clientAddress(req: Record<string, unknown>): string {
  const headers = (req['headers'] ?? {}) as Record<string, string | string[] | undefined>;
  const cf = headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf) return cf;
  const forwarded = headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || String(req['ip'] ?? 'unknown');
}

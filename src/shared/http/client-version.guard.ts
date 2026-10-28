import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { loadConfiguration } from '../../config/configuration';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export const CLIENT_VERSION_HEADER = 'x-client-version';

/**
 * Rejects panels older than MIN_CLIENT_VERSION with 426 so they reload the new release. Requests
 * without the header (mobile app, edge agent, tools) and deployments without the setting pass.
 */
@Injectable()
export class ClientVersionGuard implements CanActivate {
  // Read on first request: building the app without credentials (OpenAPI generation) must work.
  private minVersion: string | null | undefined;
  private productMinimums: Record<string, string> | undefined;

  canActivate(context: ExecutionContext): boolean {
    const config = loadConfiguration();
    this.minVersion ??= config.minClientVersion ?? null;
    this.productMinimums ??= config.minClientVersions;
    if (context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined>; originalUrl?: string; url?: string }>();
    const product = productFromUrl(request.originalUrl ?? request.url ?? '');
    const minimum = (product && this.productMinimums[product]) || this.minVersion;
    if (!minimum) return true;
    const raw = request.headers?.[CLIENT_VERSION_HEADER];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header) return true;
    if (compareVersions(header, minimum) < 0) {
      throw new AppException(
        ErrorCode.CLIENT_UPGRADE_REQUIRED,
        `Client ${header} is older than the minimum supported version ${minimum}`,
        { minimumVersion: minimum, ...(product ? { product } : {}) },
      );
    }
    return true;
  }
}

export function productFromUrl(url: string): string | null {
  return url.match(/\/api\/v1\/([^/?#]+)/)?.[1]?.toLocaleLowerCase('en-US') ?? null;
}

/** Compares the `x.y.z` part of two versions (anything after `+` or `-` is ignored). */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => v.split(/[+-]/)[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
  const [left, right] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

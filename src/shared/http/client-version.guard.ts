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

  canActivate(context: ExecutionContext): boolean {
    this.minVersion ??= loadConfiguration().minClientVersion ?? null;
    if (!this.minVersion || context.getType() !== 'http') return true;
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | string[] | undefined> }>();
    const raw = request.headers?.[CLIENT_VERSION_HEADER];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header) return true;
    if (compareVersions(header, this.minVersion) < 0) {
      throw new AppException(
        ErrorCode.CLIENT_UPGRADE_REQUIRED,
        `Client ${header} is older than the minimum supported version ${this.minVersion}`,
      );
    }
    return true;
  }
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

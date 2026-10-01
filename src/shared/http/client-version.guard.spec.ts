import { ExecutionContext } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { isSessionExpired } from '../auth/firebase-auth.guard';
import { ClientVersionGuard, compareVersions } from './client-version.guard';

function ctx(headers: Record<string, string> = {}): ExecutionContext {
  return { getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ headers }) }) } as unknown as ExecutionContext;
}

describe('compareVersions', () => {
  it('compares x.y.z and ignores build metadata', () => {
    expect(compareVersions('1.2.0+abc123', '1.2.0')).toBe(0);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });
});

describe('ClientVersionGuard', () => {
  const original = process.env.MIN_CLIENT_VERSION;
  afterEach(() => {
    process.env.MIN_CLIENT_VERSION = original;
  });

  it('passes everything when no minimum is configured', () => {
    delete process.env.MIN_CLIENT_VERSION;
    expect(new ClientVersionGuard().canActivate(ctx({ 'x-client-version': '0.0.1' }))).toBe(true);
  });

  it('rejects older panels with 426 and lets clients without the header through', () => {
    process.env.MIN_CLIENT_VERSION = '1.2.0';
    const guard = new ClientVersionGuard();
    expect(guard.canActivate(ctx())).toBe(true);
    expect(guard.canActivate(ctx({ 'x-client-version': '1.2.0+deadbee' }))).toBe(true);
    try {
      guard.canActivate(ctx({ 'x-client-version': '1.1.5+abc' }));
      throw new Error('expected 426');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.CLIENT_UPGRADE_REQUIRED);
      expect((error as AppException).getStatus()).toBe(426);
    }
  });
});

describe('session max age', () => {
  const DAY = 86_400_000;
  const now = Date.parse('2026-10-01T08:00:00Z');
  it('expires a sign-in older than the limit, counted from auth_time', () => {
    const authTime = (ms: number) => Math.floor((now - ms) / 1000);
    expect(isSessionExpired(authTime(29 * DAY), 30 * DAY, now)).toBe(false);
    expect(isSessionExpired(authTime(31 * DAY), 30 * DAY, now)).toBe(true);
    expect(isSessionExpired(undefined, 30 * DAY, now)).toBe(false);
  });
});

import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { MembersController } from '../members/members.controller';
import { GymMobileController } from '../mobile/mobile.controller';
import { GymWalletController } from '../ops/commerce.controllers';
import { AccessAgentController } from '../access/access.controllers';
import { GymAuditInterceptor } from './gym-audit.interceptor';
import { describeRoute, diff, sanitize, shouldAudit } from './gym-audit.rules';
import { GymAuditLog, GymAuditService } from './gym-audit.service';

describe('gym audit rules', () => {
  it('audits state changes only, skips machine traffic and most member-app calls', () => {
    expect(shouldAudit({ method: 'GET', path: 'members' })).toBe(false);
    expect(shouldAudit({ method: 'POST', path: 'wallet/purchase' })).toBe(true);
    expect(shouldAudit({ method: 'DELETE', path: 'members/:id' })).toBe(true);
    expect(shouldAudit({ method: 'POST', path: 'access/logs' })).toBe(false);
    expect(shouldAudit({ method: 'POST', path: 'mobile/water' })).toBe(false);
    expect(shouldAudit({ method: 'POST', path: 'mobile/membership/renew' })).toBe(true);
  });

  it('labels routes and resolves the collection of the touched record', () => {
    expect(describeRoute({ method: 'POST', path: 'receivables/:id/payments' })).toMatchObject({
      entity: 'receivables',
      verb: 'action',
      label: 'Taksit tahsilatı',
      collection: 'gymReceivables',
    });
    expect(describeRoute({ method: 'PATCH', path: 'shop/products/:id' })).toMatchObject({
      verb: 'update',
      collection: 'gymShopProducts',
      label: 'Mağaza / POS: kayıt güncellendi',
    });
    expect(describeRoute({ method: 'POST', path: 'members' })).toMatchObject({ verb: 'create', collection: undefined });
    expect(describeRoute({ method: 'POST', path: 'shop/categories' }).verb).toBe('create');
    expect(describeRoute({ method: 'POST', path: 'shop/checkout' }).verb).toBe('action');
  });

  it('masks secrets and personal data and trims blobs', () => {
    const clean = sanitize({
      password: 'hunter22',
      apiKey: 'k',
      config: { apiSecret: 's', username: 'u' },
      nationalId: '10000000146',
      photoURL: 'data:image/png;base64,AAAA',
      notes: 'x'.repeat(400),
      list: Array.from({ length: 30 }, (_, i) => i),
    }) as Record<string, unknown>;
    expect(clean['password']).toBe('[gizli]');
    expect(clean['apiKey']).toBe('[gizli]');
    expect(clean['config']).toEqual({ apiSecret: '[gizli]', username: 'u' });
    expect(clean['nationalId']).toBe('100******46');
    expect(clean['photoURL']).toBe('[dosya]');
    expect((clean['notes'] as string).length).toBe(301);
    expect((clean['list'] as unknown[]).at(-1)).toBe('… +5');
  });

  it('reports only fields that changed', () => {
    expect(
      diff(
        { displayName: 'Ayşe', walletBalance: 100, updatedAt: 'a', nationalId: '10000000146' },
        { displayName: 'Ayşe', walletBalance: 50, updatedAt: 'b', nationalId: '20000000146' },
      ),
    ).toEqual({
      walletBalance: { from: 100, to: 50 },
      nationalId: { from: '100******46', to: '200******46' },
    });
    expect(diff({ a: 1 }, { a: 1 })).toBeNull();
  });
});

describe('GymAuditInterceptor', () => {
  const user = { tenantId: 't1', userId: 'staff-1', email: 'desk@gym.com', role: 'user' as const, modules: ['gym' as const] };
  let audit: { write: jest.Mock; snapshot: jest.Mock };
  let interceptor: GymAuditInterceptor;

  beforeEach(() => {
    audit = { write: jest.fn(), snapshot: jest.fn() };
    interceptor = new GymAuditInterceptor(audit as unknown as GymAuditService);
  });

  function context(controller: object, handler: string, request: Record<string, unknown>): ExecutionContext {
    const cls = controller as { prototype: Record<string, unknown> };
    return {
      getType: () => 'http',
      getClass: () => controller,
      getHandler: () => cls.prototype[handler],
      switchToHttp: () => ({ getRequest: () => ({ headers: { 'user-agent': 'jest', 'cf-connecting-ip': '1.2.3.4' }, ...request }) }),
    } as unknown as ExecutionContext;
  }

  it('records who changed which member fields', async () => {
    audit.snapshot
      .mockResolvedValueOnce({ displayName: 'Ayşe', phone: '1', updatedAt: 'a' })
      .mockResolvedValueOnce({ displayName: 'Ayşe', phone: '2', updatedAt: 'b' });
    const ctx = context(MembersController, 'update', {
      method: 'PATCH',
      params: { id: 'm1' },
      body: { phone: '2', password: 'nope' },
      currentUser: user,
    });
    const result = await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ uid: 'm1' }) }));
    expect(result).toEqual({ uid: 'm1' });
    expect(audit.snapshot).toHaveBeenCalledWith('t1', 'gymMembers', 'm1');
    const entry = audit.write.mock.calls[0][0] as GymAuditLog;
    expect(entry).toMatchObject({
      actorId: 'staff-1',
      actorEmail: 'desk@gym.com',
      actorType: 'staff',
      route: 'PATCH /gym/members/:id',
      label: 'Üye bilgileri güncellendi',
      entityId: 'm1',
      targetUserId: 'm1',
      request: { phone: '2', password: '[gizli]' },
      changes: { phone: { from: '1', to: '2' } },
      result: 'success',
      statusCode: 200,
      ip: '1.2.3.4',
      userAgent: 'jest',
    });
  });

  it('records failures with the error code and rethrows', async () => {
    const ctx = context(GymWalletController, 'purchase', {
      method: 'POST',
      body: { userId: 'm9', packageId: 'p1' },
      currentUser: user,
    });
    const error = new AppException(ErrorCode.GYM_WALLET_INSUFFICIENT, 'Insufficient wallet balance');
    await expect(lastValueFrom(interceptor.intercept(ctx, { handle: () => throwError(() => error) }))).rejects.toBe(error);
    expect(audit.write.mock.calls[0][0]).toMatchObject({
      route: 'POST /gym/wallet/purchase',
      label: 'Paket satışı',
      targetUserId: 'm9',
      result: 'error',
      statusCode: 409,
      errorCode: 'GYM_WALLET_INSUFFICIENT',
      changes: null,
    });
  });

  it('marks member-app actions as done by the member', async () => {
    const ctx = context(GymMobileController, 'renew', {
      method: 'POST',
      body: { packageId: 'p1' },
      currentUser: { ...user, userId: 'm1', accountType: 'gym_member' },
    });
    await lastValueFrom(interceptor.intercept(ctx, { handle: () => of({ ok: true }) }));
    expect(audit.write.mock.calls[0][0]).toMatchObject({ actorType: 'member', route: 'POST /gym/mobile/membership/renew' });
  });

  it('ignores reads, anonymous and agent traffic, and unaudited member-app calls', async () => {
    const handle = { handle: () => of('ok') };
    await lastValueFrom(interceptor.intercept(context(MembersController, 'list', { method: 'GET', currentUser: user }), handle));
    await lastValueFrom(interceptor.intercept(context(AccessAgentController, 'heartbeat', { method: 'POST' }), handle));
    await lastValueFrom(
      interceptor.intercept(context(GymMobileController, 'addWater', { method: 'POST', currentUser: user }), handle),
    );
    expect(audit.write).not.toHaveBeenCalled();
    expect(audit.snapshot).not.toHaveBeenCalled();
  });
});

describe('GymAuditService.list', () => {
  function log(i: number, overrides: Partial<GymAuditLog> = {}): GymAuditLog {
    return {
      id: `l${i}`,
      createdAt: new Date(Date.UTC(2026, 8, 30, 12, 0, 0) - i * 1000).toISOString(),
      entity: i % 2 ? 'wallet' : 'members',
      actorId: 'staff-1',
      label: 'x',
      actorEmail: 'desk@gym.com',
      route: 'POST /gym/x',
      entityId: null,
      targetUserId: null,
      result: 'success',
      verb: 'action',
      ...overrides,
    } as GymAuditLog;
  }

  function serviceOver(rows: GymAuditLog[]) {
    const query = (filters: { op: string; value: string }[] = []) => ({
      orderBy: () => query(filters),
      where: (_field: string, op: string, value: string) => query([...filters, { op, value }]),
      limit: (n: number) => ({
        get: async () => ({
          docs: rows
            .filter((row) => filters.every((f) => (f.op === '<=' ? row.createdAt <= f.value : row.createdAt >= f.value)))
            .slice(0, n)
            .map((row) => ({ data: () => row })),
        }),
      }),
    });
    const firebase = { db: { collection: () => query() } };
    const tenant = new TenantContext();
    jest.spyOn(tenant, 'getTenantId').mockReturnValue('t1');
    return new GymAuditService(firebase as never, tenant);
  }

  it('filters newest-first and pages with a cursor', async () => {
    const rows = Array.from({ length: 450 }, (_, i) => log(i));
    const service = serviceOver(rows);
    const first = await service.list({ entity: 'wallet', limit: 100 });
    expect(first.items).toHaveLength(100);
    expect(first.items.every((item) => item.entity === 'wallet')).toBe(true);
    expect(first.items[0].id).toBe('l1');
    const second = await service.list({ entity: 'wallet', limit: 100, cursor: first.nextCursor! });
    expect(second.items[0].id).toBe('l201');
    const byActor = await service.list({ actorEmail: 'DESK@gym.com', limit: 10 });
    expect(byActor.items).toHaveLength(10);
    expect((await service.list({ actorEmail: 'other@gym.com', limit: 10 })).items).toHaveLength(0);
    const third = await service.list({ entity: 'wallet', limit: 100, cursor: second.nextCursor! });
    expect(third.items).toHaveLength(25);
    expect(third.nextCursor).toBeNull();
  });
});

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionGuard } from './permission.guard';
import { TenantContext, TenantStore } from '../tenancy/tenant.context';
import { ErrorCode } from '../errors/error-codes';
import { AppException } from '../errors/app.exception';
import { mergePermissionMaps, normalizePermissionMap } from './permissions';

function contextStub(): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function store(overrides: Partial<TenantStore>): TenantStore {
  return {
    tenantId: 't1',
    userId: 'u1',
    role: 'user',
    modules: ['vet'],
    email: 'a@b.com',
    permissions: {},
    ...overrides,
  };
}

describe('PermissionGuard', () => {
  const reflector = new Reflector();
  const tenantContext = new TenantContext();
  const guard = new PermissionGuard(reflector, tenantContext);

  beforeEach(() => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue({ resource: 'customers', action: 'create' });
  });

  it('allows routes without a required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    tenantContext.run(store({}), () => {
      expect(guard.canActivate(contextStub())).toBe(true);
    });
  });

  it('always allows the owner', () => {
    tenantContext.run(store({ role: 'owner', permissions: {} }), () => {
      expect(guard.canActivate(contextStub())).toBe(true);
    });
  });

  it('allows a user whose roles grant the action', () => {
    tenantContext.run(store({ permissions: { customers: ['view', 'create'] } }), () => {
      expect(guard.canActivate(contextStub())).toBe(true);
    });
  });

  it('returns FORBIDDEN_PERMISSION when the action is missing', () => {
    tenantContext.run(store({ permissions: { customers: ['view'] } }), () => {
      try {
        guard.canActivate(contextStub());
        throw new Error('expected FORBIDDEN_PERMISSION');
      } catch (error) {
        expect(error).toBeInstanceOf(AppException);
        expect((error as AppException).code).toBe(ErrorCode.FORBIDDEN_PERMISSION);
      }
    });
  });
});

describe('permission maps', () => {
  it('normalizes unknown keys away and implies view for write actions', () => {
    expect(
      normalizePermissionMap({ customers: ['delete', 'delete'], unknown: ['view'], patients: [] }),
    ).toEqual({ customers: ['view', 'delete'] });
  });

  it('merges multiple roles as a union', () => {
    expect(
      mergePermissionMaps([
        { customers: ['view'], sales: ['view', 'create'] },
        { customers: ['view', 'update'] },
      ]),
    ).toEqual({ customers: ['view', 'update'], sales: ['view', 'create'] });
  });
});

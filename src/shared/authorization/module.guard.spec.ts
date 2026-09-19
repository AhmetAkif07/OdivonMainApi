import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleGuard } from './module.guard';
import { TenantContext } from '../tenancy/tenant.context';
import { ErrorCode } from '../errors/error-codes';
import { AppException } from '../errors/app.exception';
import { FarmController } from '../../modules/farm/farm.controller';

function contextStub(): ExecutionContext {
  return {
    getHandler: () => FarmController.prototype.health,
    getClass: () => FarmController,
  } as unknown as ExecutionContext;
}

describe('ModuleGuard', () => {
  const reflector = new Reflector();
  const tenantContext = new TenantContext();
  const guard = new ModuleGuard(reflector, tenantContext);

  beforeEach(() => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('farm');
  });

  it('allows access when the required module is present', () => {
    tenantContext.enter({
      tenantId: 't1',
      userId: 'u1',
      role: 'owner',
      modules: ['farm'],
      email: 'a@b.com',
    });
    expect(guard.canActivate(contextStub())).toBe(true);
  });

  it('returns FORBIDDEN_MODULE when farm is not enabled', () => {
    tenantContext.enter({
      tenantId: 't1',
      userId: 'u1',
      role: 'owner',
      modules: ['vet'],
      email: 'a@b.com',
    });
    try {
      guard.canActivate(contextStub());
      throw new Error('expected FORBIDDEN_MODULE');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.FORBIDDEN_MODULE);
    }
  });
});

describe('FarmController', () => {
  it('returns NOT_IMPLEMENTED after authorization succeeds', () => {
    const controller = new FarmController();
    try {
      controller.health();
      throw new Error('expected NOT_IMPLEMENTED');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).code).toBe(ErrorCode.NOT_IMPLEMENTED);
    }
  });
});

import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ModuleGuard } from './module.guard';
import { TenantContext } from '../tenancy/tenant.context';
import { ErrorCode } from '../errors/error-codes';
import { AppException } from '../errors/app.exception';
import { FarmCoreController } from '../../modules/farm/core/farm-core.controller';
import { FarmDataController } from '../../modules/farm/data/farm-data.controller';
import { REQUIRED_MODULE_KEY } from './module.decorator';

function contextStub(): ExecutionContext {
  return {
    getHandler: () => FarmCoreController.prototype.me,
    getClass: () => FarmCoreController,
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
    tenantContext.run(
      {
        tenantId: 't1',
        userId: 'u1',
        role: 'owner',
        modules: ['farm'],
        email: 'a@b.com',
      },
      () => {
        expect(guard.canActivate(contextStub())).toBe(true);
      },
    );
  });

  it('returns FORBIDDEN_MODULE when farm is not enabled', () => {
    tenantContext.run(
      {
        tenantId: 't1',
        userId: 'u1',
        role: 'owner',
        modules: ['vet'],
        email: 'a@b.com',
      },
      () => {
        try {
          guard.canActivate(contextStub());
          throw new Error('expected FORBIDDEN_MODULE');
        } catch (error) {
          expect(error).toBeInstanceOf(AppException);
          expect((error as AppException).code).toBe(ErrorCode.FORBIDDEN_MODULE);
        }
      },
    );
  });
});

describe('farm controllers', () => {
  it('require the farm module', () => {
    const reflector = new Reflector();
    expect(reflector.get(REQUIRED_MODULE_KEY, FarmCoreController)).toBe('farm');
    expect(reflector.get(REQUIRED_MODULE_KEY, FarmDataController)).toBe('farm');
  });
});

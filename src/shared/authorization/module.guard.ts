import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { TenantContext } from '../tenancy/tenant.context';
import { ProductModule } from './constants';
import { REQUIRED_MODULE_KEY } from './module.decorator';

@Injectable()
export class ModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ProductModule | undefined>(
      REQUIRED_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required) {
      return true;
    }

    const modules = this.tenantContext.getStore().modules;
    if (!modules.includes(required)) {
      throw new AppException(
        ErrorCode.FORBIDDEN_MODULE,
        `Module '${required}' is not enabled for this user`,
      );
    }
    return true;
  }
}

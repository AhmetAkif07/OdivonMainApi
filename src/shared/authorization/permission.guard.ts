import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { resolveRequestTenant, TenantContext } from '../tenancy/tenant.context';
import { hasPermission } from './permissions';
import { PERMISSION_KEY, RequiredPermission } from './require-permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RequiredPermission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      return true;
    }

    const current = resolveRequestTenant(context, this.tenantContext);
    if (current.role === 'owner') {
      return true;
    }
    if (!hasPermission(current.permissions, required.resource, required.action)) {
      throw new AppException(
        ErrorCode.FORBIDDEN_PERMISSION,
        `Missing permission ${required.resource}:${required.action}`,
      );
    }
    return true;
  }
}

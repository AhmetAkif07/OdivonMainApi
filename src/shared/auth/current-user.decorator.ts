import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { TenantContext, TenantStore } from '../tenancy/tenant.context';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantStore => {
    const request = ctx.switchToHttp().getRequest<Request & { tenantContext?: TenantContext }>();
    const fromRequest = (request as Request & { currentUser?: TenantStore }).currentUser;
    if (fromRequest) {
      return fromRequest;
    }
    throw new AppException(ErrorCode.AUTH_REQUIRED, 'Current user is not available');
  },
);

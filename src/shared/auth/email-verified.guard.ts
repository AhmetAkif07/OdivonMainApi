import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import { resolveRequestTenant, TenantContext } from '../tenancy/tenant.context';

/** Product routes opt in so profiles created before verification support remain compatible. */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const current = resolveRequestTenant(context, this.tenantContext);
    if (current.emailVerified === false) {
      throw new AppException(
        ErrorCode.EMAIL_NOT_VERIFIED,
        'E-posta adresinizi doğrulamadan devam edemezsiniz.',
      );
    }
    return true;
  }
}

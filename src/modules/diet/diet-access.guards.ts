import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { resolveRequestTenant, TenantContext } from '../../shared/tenancy/tenant.context';

/** Staff routes: portal (client) accounts are turned away even where no permission is required. */
@Injectable()
export class DietStaffGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const current = resolveRequestTenant(context, this.tenantContext);
    if (current.accountType === 'diet_member' || current.accountType === 'gym_member') {
      throw new AppException(ErrorCode.FORBIDDEN_ROLE, 'Bu bölüm yalnızca klinik personeline açıktır.');
    }
    return true;
  }
}

/** Member portal routes: only diet portal accounts bound to a client record. */
@Injectable()
export class DietMemberGuard implements CanActivate {
  constructor(private readonly tenantContext: TenantContext) {}

  canActivate(context: ExecutionContext): boolean {
    const current = resolveRequestTenant(context, this.tenantContext);
    if (current.accountType !== 'diet_member' || !current.dietClientId) {
      throw new AppException(ErrorCode.DIET_PORTAL_FORBIDDEN, 'Bu bölüm yalnızca danışan hesaplarına açıktır.');
    }
    return true;
  }
}

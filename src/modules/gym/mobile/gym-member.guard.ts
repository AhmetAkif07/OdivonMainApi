import { CanActivate, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { MembersRepository } from '../members/members.repository';

@Injectable()
export class GymMemberGuard implements CanActivate {
  constructor(
    private readonly members: MembersRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(): Promise<boolean> {
    const userId = this.tenantContext.getUserId();
    try {
      const member = await this.members.getByIdOrThrow(userId);
      if (member.isArchived) {
        throw new AppException(ErrorCode.GYM_MEMBER_FORBIDDEN, 'Member account is archived');
      }
      return true;
    } catch (error) {
      if (error instanceof AppException && error.code === ErrorCode.GYM_MEMBER_FORBIDDEN) {
        throw error;
      }
      throw new AppException(ErrorCode.GYM_MEMBER_FORBIDDEN, 'This endpoint is only available to gym members');
    }
  }
}

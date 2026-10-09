import { createParamDecorator, ExecutionContext, UseGuards, applyDecorators } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { PlatformAdminGuard, PlatformAdminUser, PLATFORM_ADMIN_KEY } from './platform-admin.guard';

export function RequirePlatformAdmin() {
  return applyDecorators(
    ApiBearerAuth(),
    UseGuards(FirebaseAuthGuard, PlatformAdminGuard),
  );
}

export const CurrentPlatformAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PlatformAdminUser => {
    const req = ctx.switchToHttp().getRequest<Request & { [PLATFORM_ADMIN_KEY]?: PlatformAdminUser }>();
    return req[PLATFORM_ADMIN_KEY]!;
  },
);

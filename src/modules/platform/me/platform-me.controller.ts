import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';

@ApiTags('platform-me')
@RequirePlatformAdmin()
@Controller('platform/me')
export class PlatformMeController {
  @Get()
  @ApiOperation({ summary: 'Platform admin oturum bilgisi' })
  me(@CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return {
      uid: admin.uid,
      email: admin.email,
      status: admin.status,
      grantedAt: admin.grantedAt,
      isPlatformAdmin: true,
    };
  }
}

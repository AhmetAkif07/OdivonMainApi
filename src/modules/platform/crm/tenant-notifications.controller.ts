import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { TenantStore } from '../../../shared/tenancy/tenant.context';
import { CrmNotificationsService } from './crm-notifications.service';
import { TenantNotificationsQueryDto } from './dto';

/** Odivon announcements for the signed-in tenant user (any module app can show them). */
@ApiTags('platform-notifications')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, TenantGuard)
@Controller('notifications/platform')
export class TenantPlatformNotificationsController {
  constructor(private readonly notifications: CrmNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Odivon tarafından işletmeye gönderilen bildirimler' })
  list(@CurrentUser() user: TenantStore, @Query() query: TenantNotificationsQueryDto) {
    return this.notifications.listForTenant(user.tenantId, user.userId, {
      unreadOnly: query.unreadOnly === 'true',
      limit: Number(query.limit) || undefined,
    });
  }

  @Post('read-all')
  readAll(@CurrentUser() user: TenantStore) {
    return this.notifications.markAllRead(user.tenantId, user.userId);
  }

  @Post(':id/read')
  read(@CurrentUser() user: TenantStore, @Param('id') id: string) {
    return this.notifications.markRead(user.tenantId, user.userId, id);
  }
}

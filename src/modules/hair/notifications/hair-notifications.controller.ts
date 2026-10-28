import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairNotificationsService } from './hair-notifications.service';
import { SendHairNotificationDto } from './notification.dto';
import { HairSmsService } from './sms/hair-sms.service';

/** Any hair staff member may read their own / their branch's notifications (no permission key). */
@ApiTags('hair-notifications')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/notifications')
export class HairNotificationsController {
  constructor(
    private readonly notifications: HairNotificationsService,
    private readonly sms: HairSmsService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Caller's notifications, newest first; status=unread|read, type" })
  list(@Query() query: HairListQueryDto) {
    return this.notifications.list(query);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string) {
    return this.notifications.markRead(id);
  }

  @Get('sms-log')
  @RequirePermission('hairSettings', 'view')
  @ApiOperation({ summary: 'SMS send log (newest first); type, status=sent|failed, customerId, from/to on createdAt' })
  smsLog(@Query() query: HairListQueryDto) {
    return this.notifications.smsLog(query);
  }

  @Get('sms-status')
  @RequirePermission('hairSettings', 'view')
  @ApiOperation({ summary: '{ configured, provider } of the SMS gateway (credentials are server env only)' })
  smsStatus() {
    return this.sms.status();
  }

  @Post('send')
  @RequirePermission('hairSettings', 'update')
  @ApiOperation({ summary: 'Queue a manual notification (external channels are delivered later)' })
  send(@Body() dto: SendHairNotificationDto) {
    return this.notifications.send(dto);
  }
}

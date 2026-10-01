import { Body, Controller, Get, HttpCode, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { ListRemindersQueryDto, ReminderSettingsDto, RunRemindersDto } from './reminders.dto';
import { GymRemindersService } from './reminders.service';

@ApiTags('gym-reminders')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/reminders')
export class GymRemindersController {
  constructor(private readonly reminders: GymRemindersService) {}

  @Get()
  @RequirePermission('reminders', 'view')
  @ApiOperation({ summary: 'Bir günün hatırlatmaları (varsayılan bugün)' })
  list(@Query() query: ListRemindersQueryDto) {
    return this.reminders.list(query.day, query.type);
  }

  @Get('settings')
  @RequirePermission('reminders', 'view')
  settings() {
    return this.reminders.getSettings();
  }

  @Patch('settings')
  @Roles('owner', 'admin')
  @RequirePermission('reminders', 'update')
  @ApiOperation({ summary: 'Eşikler, şablonlar, otomatik SMS' })
  saveSettings(@Body() dto: ReminderSettingsDto) {
    return this.reminders.saveSettings(dto);
  }

  @Post('run')
  @HttpCode(200)
  @Roles('owner', 'admin')
  @RequirePermission('reminders', 'create')
  @ApiOperation({ summary: 'Bugünün hatırlatmalarını şimdi üret (dryRun: önizleme)' })
  run(@Body() dto: RunRemindersDto) {
    return this.reminders.runForTenant({ dryRun: dto.dryRun ?? false });
  }
}

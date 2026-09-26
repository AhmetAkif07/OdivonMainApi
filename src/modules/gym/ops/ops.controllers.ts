import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';
import { GymOpsService } from './ops.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard] as const;

@ApiTags('gym-access')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/access')
export class GymAccessController {
  constructor(private readonly ops: GymOpsService) {}

  @Get('gates')
  @RequirePermission('accessControl', 'view')
  gates(@Query() query: GymListQueryDto) {
    return this.ops.listGates(query);
  }

  @Post('gates')
  @RequirePermission('accessControl', 'create')
  createGate(@Body() dto: GymRecordDto) {
    return this.ops.createGate(dto);
  }

  @Patch('gates/:id')
  @RequirePermission('accessControl', 'update')
  updateGate(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.ops.updateGate(id, dto);
  }

  @Delete('gates/:id')
  @RequirePermission('accessControl', 'delete')
  removeGate(@Param('id') id: string) {
    return this.ops.removeGate(id);
  }

  @Get('logs')
  @RequirePermission('accessControl', 'view')
  logs(@Query() query: GymListQueryDto) {
    return this.ops.listAccessLogs(query);
  }

  @Post('logs')
  @RequirePermission('accessControl', 'create')
  createLog(@Body() dto: GymRecordDto) {
    return this.ops.createAccessLog(dto);
  }

  @Post('scan')
  @RequirePermission('accessControl', 'create')
  scan(@Body() dto: GymRecordDto) {
    return this.ops.scan(dto);
  }

  @Post('commands')
  @RequirePermission('accessControl', 'create')
  command(@Body() dto: GymRecordDto) {
    return this.ops.queueDeviceCommand(dto);
  }
}

@ApiTags('gym-campaigns')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/campaigns')
export class GymCampaignsController {
  constructor(private readonly ops: GymOpsService) {}

  @Get()
  @RequirePermission('campaigns', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.ops.listCampaigns(query);
  }

  @Post()
  @RequirePermission('campaigns', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.ops.createCampaign(dto);
  }

  @Post('broadcast')
  @RequirePermission('campaigns', 'create')
  broadcast(@Body() dto: GymRecordDto) {
    return this.ops.broadcast(dto);
  }

  @Patch(':id')
  @RequirePermission('campaigns', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.ops.updateCampaign(id, dto);
  }

  @Delete(':id')
  @RequirePermission('campaigns', 'delete')
  remove(@Param('id') id: string) {
    return this.ops.removeCampaign(id);
  }
}

@ApiTags('gym-sms')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/sms')
export class GymSmsController {
  constructor(private readonly ops: GymOpsService) {}

  @Get('config')
  @RequirePermission('sms', 'view')
  config() {
    return this.ops.getSmsConfig();
  }

  @Patch('config')
  @RequirePermission('sms', 'update')
  save(@Body() dto: GymRecordDto) {
    return this.ops.saveSmsConfig(dto);
  }

  @Post('send')
  @RequirePermission('sms', 'create')
  send(@Body() dto: GymRecordDto) {
    return this.ops.sendSms(dto);
  }
}

@ApiTags('gym-saas')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/saas')
export class GymSaasController {
  constructor(private readonly ops: GymOpsService) {}

  @Get()
  @RequirePermission('saas', 'view')
  get() {
    return this.ops.getSaas();
  }

  @Patch()
  @RequirePermission('saas', 'update')
  save(@Body() dto: GymRecordDto) {
    return this.ops.saveSaas(dto);
  }
}

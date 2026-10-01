import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { ConvertLeadDto, FunnelQueryDto, LeadStageDto, RecordReferralDto, ReferralSettingsDto } from './leads.dto';
import { GymLeadsService } from './leads.service';

@ApiTags('gym-leads')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/leads')
export class GymLeadsController {
  constructor(private readonly leads: GymLeadsService) {}

  @Get('funnel')
  @RequirePermission('guestMembers', 'view')
  @ApiOperation({ summary: 'Aday hunisi: aşamalar, kaynaklar, personel, kayıp nedenleri' })
  funnel(@Query() query: FunnelQueryDto) {
    return this.leads.funnel(query);
  }

  @Post(':id/stage')
  @HttpCode(200)
  @RequirePermission('guestMembers', 'update')
  @ApiOperation({ summary: 'Adayı bir aşamaya taşı (geçmişe yazılır)' })
  stage(@Param('id') id: string, @Body() dto: LeadStageDto) {
    return this.leads.changeStage(id, dto);
  }

  @Post(':id/convert')
  @HttpCode(200)
  @RequirePermission('guestMembers', 'update')
  @ApiOperation({ summary: 'Adayı üyeye bağla; tavsiye edene ödül (bir kez)' })
  convert(@Param('id') id: string, @Body() dto: ConvertLeadDto) {
    return this.leads.convert(id, dto);
  }
}

@ApiTags('gym-referrals')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/referrals')
export class GymReferralsController {
  constructor(private readonly leads: GymLeadsService) {}

  @Get()
  @RequirePermission('campaigns', 'view')
  @ApiOperation({ summary: 'Tavsiye ödülleri ve tavsiye eden üyeler' })
  list() {
    return this.leads.rewards();
  }

  @Post()
  @HttpCode(200)
  @RequirePermission('campaigns', 'create')
  @ApiOperation({ summary: 'Adaysız gelen üyeyi tavsiye edene bağla' })
  record(@Body() dto: RecordReferralDto) {
    return this.leads.recordReferral(dto);
  }

  @Get('settings')
  @RequirePermission('campaigns', 'view')
  settings() {
    return this.leads.referralSettings();
  }

  @Patch('settings')
  @Roles('owner', 'admin')
  @RequirePermission('campaigns', 'update')
  @ApiOperation({ summary: 'Tavsiye programı (varsayılan kapalı), ödül türü ve tutarı' })
  saveSettings(@Body() dto: ReferralSettingsDto) {
    return this.leads.saveReferralSettings(dto);
  }
}

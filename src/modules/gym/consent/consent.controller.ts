import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import {
  RecordMemberConsentsDto,
  RevokeConsentDto,
  UpsertConsentTextDto,
} from './consent.dto';
import { GymConsentService } from './consent.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard] as const;

@ApiTags('gym-consents')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/consents')
export class GymConsentController {
  constructor(private readonly service: GymConsentService) {}

  @Get('texts')
  @RequirePermission('members', 'view')
  @ApiOperation({ summary: 'Get active consent and disclosure texts' })
  getActiveTexts() {
    return this.service.getActiveTexts();
  }

  @Post('texts')
  @Roles('owner', 'admin')
  @RequirePermission('members', 'update')
  @ApiOperation({ summary: 'Create or update consent text template' })
  upsertText(@Body() dto: UpsertConsentTextDto) {
    return this.service.upsertText(dto);
  }

  @Get('members/:memberId')
  @RequirePermission('members', 'view')
  @ApiOperation({ summary: 'Get member consent history and active statuses' })
  getMemberConsents(@Param('memberId') memberId: string) {
    return this.service.getMemberConsents(memberId);
  }

  @Post('record')
  @RequirePermission('members', 'update')
  @ApiOperation({ summary: 'Record consent choices with audit log' })
  recordConsents(@Body() dto: RecordMemberConsentsDto) {
    return this.service.recordConsents(dto);
  }

  @Post('revoke')
  @RequirePermission('members', 'update')
  @ApiOperation({ summary: 'Revoke a previously granted consent' })
  revokeConsent(@Body() dto: RevokeConsentDto) {
    return this.service.revokeConsent(dto);
  }
}

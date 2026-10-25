import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { FIRE_SAFE_ROLE_TEMPLATES } from './fire-safe.constants';
import {
  CreateFireSafeRecordDto,
  FireSafeListQueryDto,
  UpdateFireSafeRecordDto,
} from './fire-safe.dto';
import { FireSafeService } from './fire-safe.service';

@ApiTags('fire-safe')
@ApiBearerAuth()
@RequireModule('fire-safe')
@UseGuards(
  FirebaseAppCheckGuard,
  FirebaseAuthGuard,
  TenantGuard,
  EmailVerifiedGuard,
  SubscriptionGuard,
  ModuleGuard,
  PermissionGuard,
)
@Controller('fire-safe')
export class FireSafeController {
  constructor(private readonly service: FireSafeService) {}
  @Get('roles/templates') @RequirePermission('fireSafeRecords', 'view') roleTemplates() {
    return FIRE_SAFE_ROLE_TEMPLATES;
  }
  @Get('dashboard') @RequirePermission('fireSafeRecords', 'view') dashboard() {
    return this.service.dashboard();
  }
  @Get('audit') @RequirePermission('fireSafeRecords', 'view') allAudit(
    @Query('limit') limit?: string,
  ) {
    return this.service.allAudit(Number(limit) || 100);
  }
  @Get('entitlements') @RequirePermission('fireSafeRecords', 'view') entitlements() {
    return this.service.entitlements();
  }
  @Get('reports/compliance') @RequirePermission('fireSafeRecords', 'export') complianceReport() {
    return this.service.complianceReport();
  }
  @Get('records')
  @RequirePermission('fireSafeRecords', 'view')
  @ApiOperation({ summary: 'List tenant Yangın güvenliği records' })
  list(@Query() query: FireSafeListQueryDto) {
    return this.service.list(query);
  }
  @Get('records/:id/audit') @RequirePermission('fireSafeRecords', 'view') audit(
    @Param('id') id: string,
  ) {
    return this.service.audit(id);
  }
  @Get('records/:id') @RequirePermission('fireSafeRecords', 'view') get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Post('records') @RequirePermission('fireSafeRecords', 'create') create(
    @Body() dto: CreateFireSafeRecordDto,
  ) {
    return this.service.create(dto);
  }
  @Patch('records/:id') @RequirePermission('fireSafeRecords', 'update') update(
    @Param('id') id: string,
    @Body() dto: UpdateFireSafeRecordDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete('records/:id') @RequirePermission('fireSafeRecords', 'delete') archive(
    @Param('id') id: string,
  ) {
    return this.service.archive(id);
  }
  @Post('records/:id/restore') @RequirePermission('fireSafeRecords', 'delete') restore(
    @Param('id') id: string,
  ) {
    return this.service.restore(id);
  }
}

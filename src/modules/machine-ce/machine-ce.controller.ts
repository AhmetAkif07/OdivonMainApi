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
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { MACHINE_CE_ROLE_TEMPLATES } from './machine-ce.constants';
import {
  CompleteMachineCeOnboardingDto,
  CreateMachineCeRecordDto,
  MachineCeListQueryDto,
  UpdateMachineCeRecordDto,
} from './machine-ce.dto';
import { MachineCeService } from './machine-ce.service';

@ApiTags('machine-ce')
@ApiBearerAuth()
@RequireModule('machine-ce')
@UseGuards(
  FirebaseAppCheckGuard,
  FirebaseAuthGuard,
  TenantGuard,
  EmailVerifiedGuard,
  SubscriptionGuard,
  ModuleGuard,
  PermissionGuard,
)
@Controller('machine-ce')
export class MachineCeController {
  constructor(private readonly service: MachineCeService) {}

  @Get('roles/templates')
  @RequirePermission('machineCeRecords', 'view')
  roleTemplates() {
    return MACHINE_CE_ROLE_TEMPLATES;
  }

  @Get('dashboard')
  @RequirePermission('machineCeRecords', 'view')
  dashboard() {
    return this.service.dashboard();
  }

  @Get('audit')
  @RequirePermission('machineCeRecords', 'view')
  allAudit(@Query('limit') limit?: string) {
    return this.service.allAudit(Number(limit) || 100);
  }

  @Get('entitlements')
  @RequirePermission('machineCeRecords', 'view')
  entitlements() {
    return this.service.entitlements();
  }

  @Post('onboarding/complete')
  @RequirePermission('machineCeRecords', 'update')
  completeOnboarding(@Body() dto: CompleteMachineCeOnboardingDto) {
    return this.service.completeOnboarding(dto);
  }

  @Get('reports/compliance')
  @RequirePermission('machineCeRecords', 'export')
  complianceReport() {
    return this.service.complianceReport();
  }

  @Get('records')
  @RequirePermission('machineCeRecords', 'view')
  @ApiOperation({ summary: 'List tenant Machine CE compliance records' })
  list(@Query() query: MachineCeListQueryDto) {
    return this.service.list(query);
  }

  @Get('records/:id/audit')
  @RequirePermission('machineCeRecords', 'view')
  audit(@Param('id') id: string) {
    return this.service.audit(id);
  }

  @Get('records/:id')
  @RequirePermission('machineCeRecords', 'view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post('records')
  @RequirePermission('machineCeRecords', 'create')
  create(@Body() dto: CreateMachineCeRecordDto) {
    return this.service.create(dto);
  }

  @Patch('records/:id')
  @RequirePermission('machineCeRecords', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateMachineCeRecordDto) {
    return this.service.update(id, dto);
  }

  @Delete('records/:id')
  @RequirePermission('machineCeRecords', 'delete')
  archive(@Param('id') id: string) {
    return this.service.archive(id);
  }

  @Post('records/:id/restore')
  @RequirePermission('machineCeRecords', 'delete')
  restore(@Param('id') id: string) {
    return this.service.restore(id);
  }
}

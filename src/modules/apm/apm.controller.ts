import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { ApmService } from './apm.service';

@ApiTags('apm')
@ApiBearerAuth()
@RequireModule('apm')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('apm')
export class ApmController {
  constructor(private readonly apm: ApmService) {}

  @Get('dashboard')
  @RequirePermission('apmDashboard', 'view')
  dashboard() {
    return this.apm.dashboard();
  }

  @Get('appointments')
  @RequirePermission('apmAppointments', 'view')
  appointments(@Query('from') from?: string, @Query('to') to?: string) {
    return this.apm.appointments(from, to);
  }
}

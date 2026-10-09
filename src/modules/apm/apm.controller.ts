import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { SaveApmAppointmentDto, SetApmAppointmentStatusDto } from './apm.dto';
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

  @Get('subscription')
  @RequirePermission('apmDashboard', 'view')
  subscription() {
    return this.apm.subscription();
  }

  @Get('appointments/:id')
  @RequirePermission('apmAppointments', 'view')
  appointment(@Param('id') id: string) {
    return this.apm.get(id);
  }

  @Post('appointments')
  @RequirePermission('apmAppointments', 'create')
  create(@Body() dto: SaveApmAppointmentDto) {
    return this.apm.save(dto);
  }

  @Patch('appointments/:id')
  @RequirePermission('apmAppointments', 'update')
  update(@Param('id') id: string, @Body() dto: SaveApmAppointmentDto) {
    return this.apm.save(dto, id);
  }

  @Patch('appointments/:id/status')
  @RequirePermission('apmAppointments', 'update')
  setStatus(@Param('id') id: string, @Body() dto: SetApmAppointmentStatusDto) {
    return this.apm.setStatus(id, dto.status);
  }

  @Delete('appointments/:id')
  @RequirePermission('apmAppointments', 'delete')
  remove(@Param('id') id: string) {
    return this.apm.remove(id);
  }
}

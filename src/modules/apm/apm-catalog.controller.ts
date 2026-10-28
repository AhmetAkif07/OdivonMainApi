import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import {
  SaveApmBranchDto,
  SaveApmDeviceTokenDto,
  SaveApmServiceDto,
  SaveApmStaffDto,
  SaveApmTimeOffDto,
  SaveApmWorkingHourDto,
} from './apm-catalog.dto';
import { ApmCatalogService } from './apm-catalog.service';

@ApiTags('apm-admin')
@ApiBearerAuth()
@RequireModule('apm')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('apm')
export class ApmCatalogController {
  constructor(private readonly catalog: ApmCatalogService) {}

  @Get('branches') @RequirePermission('apmBranches', 'view') branches() { return this.catalog.branches(); }
  @Post('branches') @RequirePermission('apmBranches', 'create') createBranch(@Body() dto: SaveApmBranchDto) { return this.catalog.saveBranch(dto); }
  @Patch('branches/:id') @RequirePermission('apmBranches', 'update') updateBranch(@Param('id') id: string, @Body() dto: SaveApmBranchDto) { return this.catalog.saveBranch(dto, id); }
  @Delete('branches/:id') @RequirePermission('apmBranches', 'delete') deleteBranch(@Param('id') id: string) { return this.catalog.removeBranch(id); }

  @Get('services') @RequirePermission('apmServices', 'view') services() { return this.catalog.services(); }
  @Post('services') @RequirePermission('apmServices', 'create') createService(@Body() dto: SaveApmServiceDto) { return this.catalog.saveService(dto); }
  @Patch('services/:id') @RequirePermission('apmServices', 'update') updateService(@Param('id') id: string, @Body() dto: SaveApmServiceDto) { return this.catalog.saveService(dto, id); }
  @Delete('services/:id') @RequirePermission('apmServices', 'delete') deleteService(@Param('id') id: string) { return this.catalog.remove('apmServices', id); }

  @Get('staff') @RequirePermission('apmStaff', 'view') staff() { return this.catalog.staff(); }
  @Post('staff') @RequirePermission('apmStaff', 'create') createStaff(@Body() dto: SaveApmStaffDto) { return this.catalog.saveStaff(dto); }
  @Patch('staff/:id') @RequirePermission('apmStaff', 'update') updateStaff(@Param('id') id: string, @Body() dto: SaveApmStaffDto) { return this.catalog.saveStaff(dto, id); }
  @Delete('staff/:id') @RequirePermission('apmStaff', 'delete') deleteStaff(@Param('id') id: string) { return this.catalog.remove('apmStaff', id); }

  @Get('working-hours') @RequirePermission('apmSettings', 'view') workingHours() { return this.catalog.workingHours(); }
  @Post('working-hours') @RequirePermission('apmSettings', 'update') saveWorkingHour(@Body() dto: SaveApmWorkingHourDto) { return this.catalog.saveWorkingHour(dto); }
  @Delete('working-hours/:id') @RequirePermission('apmSettings', 'update') deleteWorkingHour(@Param('id') id: string) { return this.catalog.remove('apmWorkingHours', id); }

  @Get('time-off') @RequirePermission('apmSettings', 'view') timeOff() { return this.catalog.timeOff(); }
  @Post('time-off') @RequirePermission('apmSettings', 'update') createTimeOff(@Body() dto: SaveApmTimeOffDto) { return this.catalog.saveTimeOff(dto); }
  @Patch('time-off/:id') @RequirePermission('apmSettings', 'update') updateTimeOff(@Param('id') id: string, @Body() dto: SaveApmTimeOffDto) { return this.catalog.saveTimeOff(dto, id); }
  @Delete('time-off/:id') @RequirePermission('apmSettings', 'update') deleteTimeOff(@Param('id') id: string) { return this.catalog.remove('apmTimeOff', id); }

  @Post('devices') @RequirePermission('apmDashboard', 'view') registerDevice(@Body() dto: SaveApmDeviceTokenDto) { return this.catalog.registerAdminDevice(dto); }
  @Delete('devices') @RequirePermission('apmDashboard', 'view') removeDevice(@Query('token') token: string) { return this.catalog.removeAdminDevice(token); }
}

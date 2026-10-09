import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { VetReportFilterQueryDto } from './reports.dto';
import { VetReportsService } from './reports.service';

@ApiTags('vet-reports')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/reports')
export class VetReportsController {
  constructor(private readonly service: VetReportsService) {}

  @Get('summary')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Executive KPI Summary Cards' })
  getSummary(@Query() query: VetReportFilterQueryDto) {
    return this.service.getSummary(query);
  }

  @Get('multi-branch')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Consolidated multi-branch comparison' })
  getMultiBranch(@Query() query: VetReportFilterQueryDto) {
    return this.service.getMultiBranch(query);
  }

  @Get('clinical')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Clinical diagnoses, species distribution and hospitalization' })
  getClinical(@Query() query: VetReportFilterQueryDto) {
    return this.service.getClinical(query);
  }

  @Get('vaccine-appointments')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Vaccine schedules, overdue vaccines and appointment rates' })
  getVaccines(@Query() query: VetReportFilterQueryDto) {
    return this.service.getVaccines(query);
  }

  @Get('financial')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Financial Z-Report, revenue categories, aging and staff commissions' })
  getFinancial(@Query() query: VetReportFilterQueryDto) {
    return this.service.getFinancial(query);
  }

  @Get('inventory')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Pharmacy stock, critical alerts, expiry dates and ABC analysis' })
  getInventory(@Query() query: VetReportFilterQueryDto) {
    return this.service.getInventory(query);
  }

  @Get('services')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Pet hotel occupancy and grooming statistics' })
  getServices(@Query() query: VetReportFilterQueryDto) {
    return this.service.getServices(query);
  }

  @Get('crm-retention')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'CRM customer retention, at-risk patients and messaging analytics' })
  getCrmRetention(@Query() query: VetReportFilterQueryDto) {
    return this.service.getCrmRetention(query);
  }
}

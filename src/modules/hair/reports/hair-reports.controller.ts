import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairReportsService } from './hair-reports.service';
import { HairReportQueryDto } from './report.dto';

@ApiTags('hair')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/dashboard')
export class HairDashboardController {
  constructor(private readonly reports: HairReportsService) {}

  @Get()
  @RequirePermission('hairDashboard', 'view')
  @ApiOperation({ summary: 'KPIs: today revenue/appointments, customers, pending, 14-day trend, staff, recent' })
  dashboard(@Query() query: HairReportQueryDto) {
    return this.reports.dashboard(query);
  }
}

@ApiTags('hair-reports')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/reports')
export class HairReportsController {
  constructor(private readonly reports: HairReportsService) {}

  @Get('daily')
  @RequirePermission('hairReports', 'view')
  @ApiOperation({ summary: 'Daily report (?date=, ?branchId=)' })
  daily(@Query() query: HairReportQueryDto) {
    return this.reports.daily(query);
  }

  @Get('revenue')
  @RequirePermission('hairReports', 'view')
  @ApiOperation({ summary: 'Revenue trend and by category for from..to (inclusive)' })
  revenue(@Query() query: HairReportQueryDto) {
    return this.reports.revenue(query);
  }

  @Get('staff-performance')
  @RequirePermission('hairReports', 'view')
  staffPerformance(@Query() query: HairReportQueryDto) {
    return this.reports.staffPerformance(query);
  }

  @Get('inventory')
  @RequirePermission('hairReports', 'view')
  inventory(@Query() query: HairReportQueryDto) {
    return this.reports.inventory(query);
  }

  @Get('customer-retention')
  @RequirePermission('hairReports', 'view')
  customerRetention(@Query() query: HairReportQueryDto) {
    return this.reports.customerRetention(query);
  }
}

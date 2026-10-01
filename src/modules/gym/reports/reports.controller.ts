import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { ChurnQueryDto, HourlyOccupancyQueryDto } from './reports.dto';
import { GymReportsService } from './reports.service';

@ApiTags('gym-reports')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('gym/reports')
export class GymReportsController {
  constructor(private readonly reports: GymReportsService) {}

  @Get('occupancy/now')
  @RequirePermission('accessControl', 'view')
  @ApiOperation({ summary: 'Salondaki anlık kişi sayısı (bugünün turnike kayıtlarından)' })
  occupancyNow() {
    return this.reports.occupancyNow();
  }

  @Get('occupancy/hourly')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Gün × saat ortalama giriş (varsayılan son 28 gün)' })
  hourly(@Query() query: HourlyOccupancyQueryDto) {
    return this.reports.hourly(query.from, query.to);
  }

  @Get('churn')
  @RequirePermission('reports', 'view')
  @ApiOperation({ summary: 'Aylık churn: süresi biten ve yenilemeyen üye oranı' })
  churn(@Query() query: ChurnQueryDto) {
    return this.reports.churn(query.months ?? 6);
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformDashboardService } from './dashboard.service';

@ApiTags('platform-dashboard')
@RequirePlatformAdmin()
@Controller('platform/dashboard')
export class PlatformDashboardController {
  constructor(private readonly dashboardService: PlatformDashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Platform genel özet panosu (tenantlar, gelir, hatalar, bitecekler)' })
  getDashboard() {
    return this.dashboardService.getDashboardStats();
  }
}

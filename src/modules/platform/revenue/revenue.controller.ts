import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformRevenueService } from './revenue.service';
import { RecordManualPaymentDto, RevenueQueryDto } from './dto';

@ApiTags('platform-revenue')
@RequirePlatformAdmin()
@Controller('platform')
export class PlatformRevenueController {
  constructor(private readonly revenueService: PlatformRevenueService) {}

  @Get('revenue')
  @ApiOperation({ summary: 'Odivon SaaS gelir raporu (aylık, modül, plan kırılımları ve ödemeler)' })
  getRevenue(@Query() query: RevenueQueryDto) {
    return this.revenueService.getRevenueStats(query);
  }

  @Post('tenants/:id/payments')
  @ApiOperation({ summary: 'Tenant için manuel (havale/nakit) SaaS ödemesi kaydet ve aboneliği uzat' })
  recordManualPayment(
    @Param('id') tenantId: string,
    @Body() dto: RecordManualPaymentDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.revenueService.recordManualPayment(tenantId, dto, admin);
  }
}

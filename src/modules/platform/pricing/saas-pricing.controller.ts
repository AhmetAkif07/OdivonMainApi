import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SaasPricingService } from '../../saas-pricing/saas-pricing.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { UpdateSaasPlanPriceDto } from './dto';

@ApiTags('platform-saas-pricing')
@RequirePlatformAdmin()
@Controller('platform/saas-pricing')
export class PlatformSaasPricingController {
  constructor(
    private readonly pricing: SaasPricingService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Tüm tenantlar için ortak abonelik planları ve güncel fiyatları' })
  list() {
    return this.pricing.catalog(true);
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Plan fiyatını/adını/satış durumunu güncelle (sonraki ödemelerden itibaren geçerli)' })
  async update(
    @Param('planId') planId: string,
    @Body() dto: UpdateSaasPlanPriceDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    const { reason, ...patch } = dto;
    const { before, after } = await this.pricing.update(planId, patch, admin.email || admin.uid);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'SAAS_PRICE_UPDATED',
      targetType: 'pricing',
      targetId: planId,
      before: { name: before.name, monthly: before.monthly, yearly: before.yearly, active: before.active },
      after: { name: after.name, monthly: after.monthly, yearly: after.yearly, active: after.active },
      reason: reason ?? null,
    });
    return after;
  }
}

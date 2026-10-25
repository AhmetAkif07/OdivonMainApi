import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SaasPricingService } from './saas-pricing.service';

/**
 * No sign-in: websites and apps show current Odivon subscription prices before registration.
 * Only active plans and their prices are exposed.
 */
@ApiTags('public-saas-pricing')
@Controller('public/saas-pricing')
export class PublicSaasPricingController {
  constructor(private readonly pricing: SaasPricingService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60')
  @ApiOperation({ summary: 'Güncel Odivon abonelik fiyatları (giriş gerektirmez)' })
  @ApiQuery({ name: 'module', required: false, description: 'shared | apm | rentacar' })
  async list(@Query('module') module?: string) {
    const [catalog, plans] = await Promise.all([this.pricing.catalog(), this.pricing.activePlans(module || undefined)]);
    return {
      currency: catalog.currency,
      updatedAt: catalog.updatedAt,
      plans: plans.map(({ id, name, module: planModule, monthly, yearly }) => ({ id, name, module: planModule, monthly, yearly })),
    };
  }
}

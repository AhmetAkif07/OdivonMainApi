import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { isProductModule, SaasPricingService } from './saas-pricing.service';

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
  @ApiOperation({ summary: 'Bir ürünün güncel Odivon abonelik fiyatları (giriş gerektirmez)' })
  @ApiQuery({ name: 'product', required: false, description: 'Ürün modülü (vet, gym, farm, apm, …). Boşsa varsayılan fiyatlar.' })
  async list(@Query('product') product?: string) {
    if (product && !isProductModule(product)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Bilinmeyen ürün: ${product}`);
    }
    const target = product && isProductModule(product) ? product : null;
    const [catalog, plans] = await Promise.all([this.pricing.catalog(target), this.pricing.activePlans(target)]);
    return {
      currency: catalog.currency,
      product: target,
      updatedAt: catalog.updatedAt,
      plans: plans.map(({ id, name, module, monthly, yearly }) => ({ id, name, module, monthly, yearly })),
    };
  }
}

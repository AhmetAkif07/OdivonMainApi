import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { isProductModule, SaasPlanPricing, SaasPricingService } from '../../saas-pricing/saas-pricing.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { ResetSaasPlanPriceDto, UpdateSaasPlanPriceDto } from './dto';

function productParam(product?: string): ProductModule | null {
  if (!product) return null;
  if (!isProductModule(product)) throw new AppException(ErrorCode.VALIDATION_ERROR, `Bilinmeyen ürün: ${product}`);
  return product;
}

const snapshot = (plan: SaasPlanPricing) => ({ name: plan.name, monthly: plan.monthly, yearly: plan.yearly, active: plan.active, source: plan.source });

@ApiTags('platform-saas-pricing')
@RequirePlatformAdmin()
@Controller('platform/saas-pricing')
export class PlatformSaasPricingController {
  constructor(
    private readonly pricing: SaasPricingService,
    private readonly audit: PlatformAuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Abonelik planları: varsayılan fiyatlar veya bir ürünün fiyatları' })
  @ApiQuery({ name: 'product', required: false, description: 'Ürün modülü; boşsa tüm ürünlerin devraldığı varsayılanlar' })
  async list(@Query('product') product?: string) {
    const catalog = await this.pricing.catalog(productParam(product), true);
    return { ...catalog, products: PRODUCT_MODULES };
  }

  @Patch(':planId')
  @ApiOperation({ summary: 'Plan fiyatını güncelle (product verilirse sadece o ürün için); sonraki ödemelerden itibaren geçerli' })
  async update(
    @Param('planId') planId: string,
    @Query('product') product: string | undefined,
    @Body() dto: UpdateSaasPlanPriceDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    const { reason, ...patch } = dto;
    const result = await this.pricing.update(planId, patch, admin.email || admin.uid, productParam(product));
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'SAAS_PRICE_UPDATED',
      targetType: 'pricing',
      targetId: result.product ? `${result.product}:${planId}` : planId,
      before: snapshot(result.before),
      after: snapshot(result.after),
      reason: reason ?? null,
    });
    return result.after;
  }

  @Delete(':planId')
  @ApiOperation({ summary: 'Ürüne özel fiyatı kaldır; ürün varsayılan fiyatı devralır' })
  async reset(
    @Param('planId') planId: string,
    @Query('product') product: string | undefined,
    @Body() dto: ResetSaasPlanPriceDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    const target = productParam(product);
    if (!target) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Hangi ürünün fiyatı sıfırlanacak? (product)');
    const { before, after } = await this.pricing.resetProductPrice(planId, target);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'SAAS_PRICE_RESET',
      targetType: 'pricing',
      targetId: `${target}:${planId}`,
      before: snapshot(before),
      after: snapshot(after),
      reason: dto?.reason ?? null,
    });
    return after;
  }
}

import { Global, Module } from '@nestjs/common';
import { PublicSaasPricingController } from './public-saas-pricing.controller';
import { SaasPricingService } from './saas-pricing.service';

/** Global so payments, APM and the platform panel all read the same prices. */
@Global()
@Module({
  controllers: [PublicSaasPricingController],
  providers: [SaasPricingService],
  exports: [SaasPricingService],
})
export class SaasPricingModule {}

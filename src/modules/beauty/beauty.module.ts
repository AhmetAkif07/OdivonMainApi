import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import {
  BeautyAppointmentsController,
  BeautyCoreController,
  BeautyMobileAccessController,
  BeautyPaymentsController,
  BeautyRecommendationsController,
  BeautyReportsController,
  BeautyResourcesController,
} from './beauty.controllers';
import {
  BeautyBookingLinkController,
  BeautyPublicBookingController,
} from './booking/beauty-booking.controller';
import { BeautyBookingService } from './booking/beauty-booking.service';
import { BeautyService } from './beauty.service';
import { BeautyMobileAccessService } from './beauty-mobile-access.service';
import { BeautyStore } from './shared/beauty-store';

@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [
    BeautyBookingLinkController,
    BeautyPublicBookingController,
    BeautyCoreController,
    BeautyMobileAccessController,
    BeautyAppointmentsController,
    BeautyPaymentsController,
    BeautyReportsController,
    BeautyRecommendationsController,
    BeautyResourcesController,
  ],
  providers: [
    BeautyStore,
    BeautyService,
    BeautyMobileAccessService,
    BeautyBookingService,
  ],
  exports: [BeautyService, BeautyBookingService],
})
export class BeautyModule {}

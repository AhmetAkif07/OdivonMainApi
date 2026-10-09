import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import {
  BeautyAppointmentsController,
  BeautyCoreController,
  BeautyPaymentsController,
  BeautyRecommendationsController,
  BeautyReportsController,
  BeautyResourcesController,
} from './beauty.controllers';
import { BeautyService } from './beauty.service';
import { BeautyStore } from './shared/beauty-store';

@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [
    BeautyCoreController,
    BeautyAppointmentsController,
    BeautyPaymentsController,
    BeautyReportsController,
    BeautyRecommendationsController,
    BeautyResourcesController,
  ],
  providers: [BeautyStore, BeautyService],
  exports: [BeautyService],
})
export class BeautyModule {}

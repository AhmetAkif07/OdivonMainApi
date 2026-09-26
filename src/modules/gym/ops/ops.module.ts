import { Module } from '@nestjs/common';
import { GymMembersModule } from '../members/members.module';
import { GymPackagesModule } from '../packages/packages.module';
import { GymStore } from '../shared/gym-store';
import {
  GymAccountingController,
  GymDocumentsController,
  GymEinvoiceController,
  GymShopController,
  GymSuppliersController,
  GymWalletController,
} from './commerce.controllers';
import { GymCommerceService } from './commerce.service';
import {
  GymAccessController,
  GymCampaignsController,
  GymSaasController,
  GymSmsController,
} from './ops.controllers';
import { GymOpsService } from './ops.service';
import {
  GymAppointmentsController,
  GymCatalogController,
  GymClassesController,
  GymGuestsController,
  GymMeasurementsController,
  GymWaterController,
  GymWorkoutTemplatesController,
  GymWorkoutsController,
} from './sport.controllers';
import { GymSportService } from './sport.service';

@Module({
  imports: [GymMembersModule, GymPackagesModule],
  controllers: [
    GymClassesController,
    GymAppointmentsController,
    GymWorkoutsController,
    GymWorkoutTemplatesController,
    GymMeasurementsController,
    GymWaterController,
    GymGuestsController,
    GymCatalogController,
    GymDocumentsController,
    GymWalletController,
    GymShopController,
    GymSuppliersController,
    GymAccountingController,
    GymEinvoiceController,
    GymAccessController,
    GymCampaignsController,
    GymSmsController,
    GymSaasController,
  ],
  providers: [GymStore, GymSportService, GymCommerceService, GymOpsService],
  exports: [GymStore, GymSportService, GymCommerceService, GymOpsService],
})
export class GymOpsModule {}

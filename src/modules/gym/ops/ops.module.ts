import { Module } from '@nestjs/common';
import { GymAccessModule } from '../access/access.module';
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
import { GymReceivablesController } from './receivables.controller';
import { GymReceivablesService } from './receivables.service';
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
  imports: [GymMembersModule, GymPackagesModule, GymAccessModule],
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
    GymReceivablesController,
  ],
  providers: [GymStore, GymSportService, GymCommerceService, GymOpsService, GymReceivablesService],
  exports: [GymStore, GymSportService, GymCommerceService, GymOpsService, GymReceivablesService],
})
export class GymOpsModule {}

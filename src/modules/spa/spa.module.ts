import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { SpaAppointmentsController } from './appointments/spa-appointments.controller';
import { SpaAppointmentsService } from './appointments/spa-appointments.service';
import {
  SpaProductsController,
  SpaRoomsController,
  SpaServicesController,
  SpaStockMovementsController,
} from './catalog/spa-catalog.controllers';
import { SpaCatalogService } from './catalog/spa-catalog.service';
import { SpaCoreController } from './core/spa-core.controller';
import { SpaCoreService } from './core/spa-core.service';
import { SpaOnboardingController, SpaOnboardingService } from './core/spa-onboarding';
import { SpaCustomersController } from './customers/spa-customers.controller';
import {
  SpaAuditLogsController,
  SpaCashRegisterController,
  SpaCommissionsController,
  SpaExpensesController,
  SpaPaymentsController,
} from './finance/spa-finance.controllers';
import { SpaFinanceService } from './finance/spa-finance.service';
import {
  SpaCustomerPackagesController,
  SpaPackagePlansController,
} from './packages/spa-packages.controllers';
import { SpaPackagesService } from './packages/spa-packages.service';
import { SpaPosService } from './pos/spa-pos.service';
import { SpaSessionsController } from './pos/spa-sessions.controller';
import { SpaStore } from './shared/spa-store';
import {
  SpaLeavesController,
  SpaStaffController,
  SpaTasksController,
} from './staff/spa-staff.controllers';
import { SpaStaffService } from './staff/spa-staff.service';

/** Spa & wellness product module — replaces the SPA client's direct Firestore access. */
@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [
    SpaCoreController,
    SpaOnboardingController,
    SpaCustomersController,
    SpaRoomsController,
    SpaServicesController,
    SpaProductsController,
    SpaStockMovementsController,
    SpaStaffController,
    SpaLeavesController,
    SpaTasksController,
    SpaAppointmentsController,
    SpaPackagePlansController,
    SpaCustomerPackagesController,
    SpaSessionsController,
    SpaPaymentsController,
    SpaExpensesController,
    SpaCashRegisterController,
    SpaCommissionsController,
    SpaAuditLogsController,
  ],
  providers: [
    SpaStore,
    SpaCoreService,
    SpaOnboardingService,
    SpaCatalogService,
    SpaStaffService,
    SpaAppointmentsService,
    SpaPackagesService,
    SpaPosService,
    SpaFinanceService,
  ],
})
export class SpaModule {}

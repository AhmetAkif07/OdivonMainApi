import { Module } from '@nestjs/common';
import { MailModule } from '../../shared/mail/mail.module';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { HairAppointmentsController } from './appointments/hair-appointments.controller';
import { HairAppointmentsService } from './appointments/hair-appointments.service';
import { HairBookingController, HairBookingThrottlerGuard } from './booking/hair-booking.controller';
import { HairBookingService } from './booking/hair-booking.service';
import {
  HairProductsController,
  HairServiceCategoriesController,
  HairServicesController,
} from './catalog/hair-catalog.controller';
import { HairCatalogService } from './catalog/hair-catalog.service';
import { HairCoreController } from './core/hair-core.controller';
import { HairCoreService } from './core/hair-core.service';
import { HairOnboardingController, HairOnboardingService } from './core/hair-onboarding';
import { HairCustomersController } from './customers/hair-customers.controller';
import { HairCustomersService } from './customers/hair-customers.service';
import {
  HairAuditLogsController,
  HairCashRegisterController,
  HairCommissionsController,
  HairExpensesController,
  HairPaymentsController,
} from './finance/hair-finance.controller';
import { HairFinanceService } from './finance/hair-finance.service';
import { HairFormulasController } from './formulas/hair-formulas.controller';
import { HairFormulasService } from './formulas/hair-formulas.service';
import { HairInventoryController } from './inventory/hair-inventory.controller';
import { HairInventoryService } from './inventory/hair-inventory.service';
import { HairNotificationsController } from './notifications/hair-notifications.controller';
import { HairNotificationsService } from './notifications/hair-notifications.service';
import { HairSmsService } from './notifications/sms/hair-sms.service';
import {
  HairCustomerPackagesController,
  HairPackagesController,
} from './packages/hair-packages.controller';
import { HairPackagesService } from './packages/hair-packages.service';
import { HairPosService } from './pos/hair-pos.service';
import { HairPosController, HairSessionsController } from './pos/hair-sessions.controller';
import { HairDashboardController, HairReportsController } from './reports/hair-reports.controller';
import { HairReportsService } from './reports/hair-reports.service';
import { HairStore } from './shared/hair-store';
import {
  HairLeavesController,
  HairShiftsController,
  HairStaffController,
} from './staff/hair-staff.controller';
import { HairStaffService } from './staff/hair-staff.service';
import { HairWaitlistController } from './waitlist/hair-waitlist.controller';
import { HairWaitlistService } from './waitlist/hair-waitlist.service';

/** Hair salon product module (plan docs/odivonprohair-master-plan.md). */
@Module({
  imports: [IdentityModule, TenantModule, MailModule],
  controllers: [
    HairCoreController,
    HairOnboardingController,
    HairDashboardController,
    HairCustomersController,
    HairFormulasController,
    HairServiceCategoriesController,
    HairServicesController,
    HairProductsController,
    HairStaffController,
    HairShiftsController,
    HairLeavesController,
    HairAppointmentsController,
    HairPosController,
    HairSessionsController,
    HairPaymentsController,
    HairExpensesController,
    HairCashRegisterController,
    HairCommissionsController,
    HairAuditLogsController,
    HairInventoryController,
    HairPackagesController,
    HairCustomerPackagesController,
    HairReportsController,
    HairNotificationsController,
    HairWaitlistController,
    HairBookingController,
  ],
  providers: [
    HairStore,
    HairCoreService,
    HairOnboardingService,
    HairCustomersService,
    HairFormulasService,
    HairCatalogService,
    HairStaffService,
    HairAppointmentsService,
    HairPosService,
    HairFinanceService,
    HairInventoryService,
    HairPackagesService,
    HairReportsService,
    HairNotificationsService,
    HairSmsService,
    HairWaitlistService,
    HairBookingService,
    HairBookingThrottlerGuard,
  ],
})
export class HairModule {}

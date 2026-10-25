import { PlatformTicketsService } from './tickets/tickets.service';
import {
  PlatformTicketsController,
  SupportTicketsController,
} from './tickets/tickets.controller';
import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';
import { PlatformAuditService } from './audit/platform-audit.service';
import { PlatformAuditController } from './audit/platform-audit.controller';
import { PlatformMeController } from './me/platform-me.controller';
import { PlatformDashboardService } from './dashboard/dashboard.service';
import { PlatformDashboardController } from './dashboard/dashboard.controller';
import { PlatformTenantsService } from './tenants/tenants.service';
import { PlatformTenantsController } from './tenants/tenants.controller';
import { PlatformUsersService } from './users/users.service';
import { PlatformUsersController } from './users/users.controller';
import { PlatformRevenueService } from './revenue/revenue.service';
import { PlatformRevenueController } from './revenue/revenue.controller';
import { PlatformDemosService } from './demos/demos.service';
import { PlatformDemosController } from './demos/demos.controller';
import { PlatformErrorLogsService } from './logs/error-logs.service';
import { PlatformErrorLogsController } from './logs/error-logs.controller';
import { PlatformOrphanTenantsService } from './orphans/orphan-tenants.service';
import { PlatformOrphanTenantsController } from './orphans/orphan-tenants.controller';
import { PlatformSaasPricingController } from './pricing/saas-pricing.controller';
import { HostingerMailClient } from './crm/hostinger-mail.client';
import { CrmDirectoryService } from './crm/crm-directory.service';
import { CrmMailService } from './crm/crm-mail.service';
import { CrmNotificationsService } from './crm/crm-notifications.service';
import { CrmCampaignsService } from './crm/crm-campaigns.service';
import {
  PlatformCrmCampaignsController,
  PlatformCrmMailController,
  PlatformCrmNotificationsController,
} from './crm/crm.controller';
import { TenantPlatformNotificationsController } from './crm/tenant-notifications.controller';

@Module({
  controllers: [
    SupportTicketsController,
    PlatformTicketsController,
    PlatformMeController,
    PlatformDashboardController,
    PlatformTenantsController,
    PlatformUsersController,
    PlatformRevenueController,
    PlatformDemosController,
    PlatformErrorLogsController,
    PlatformAuditController,
    PlatformOrphanTenantsController,
    PlatformSaasPricingController,
    PlatformCrmMailController,
    PlatformCrmCampaignsController,
    PlatformCrmNotificationsController,
    TenantPlatformNotificationsController,
  ],
  providers: [
    PlatformTicketsService,
    PlatformAdminGuard,
    PlatformAuditService,
    PlatformDashboardService,
    PlatformTenantsService,
    PlatformUsersService,
    PlatformRevenueService,
    PlatformDemosService,
    PlatformErrorLogsService,
    PlatformOrphanTenantsService,
    HostingerMailClient,
    CrmDirectoryService,
    CrmMailService,
    CrmNotificationsService,
    CrmCampaignsService,
  ],
  exports: [
    PlatformTicketsService,
    PlatformAdminGuard,
    PlatformAuditService,
    PlatformTenantsService,
    PlatformUsersService,
    PlatformRevenueService,
    PlatformDemosService,
    PlatformErrorLogsService,
    CrmCampaignsService,
    CrmNotificationsService,
  ],
})
export class PlatformModule {}

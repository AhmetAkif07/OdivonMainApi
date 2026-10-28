import { Module } from '@nestjs/common';
import { MailModule } from '../../shared/mail/mail.module';
import { TenantModule } from '../tenant/tenant.module';
import { ApmController } from './apm.controller';
import { ApmService } from './apm.service';
import { ApmCatalogController } from './apm-catalog.controller';
import { ApmCatalogService } from './apm-catalog.service';
import { ApmAvailabilityController, ApmBookingController, ApmBookingThrottlerGuard } from './apm-booking.controller';
import { ApmBookingService } from './apm-booking.service';
import { ApmAppCheckGuard } from './apm-app-check.guard';
import { ApmNotificationsService } from './apm-notifications.service';

@Module({
  imports: [TenantModule, MailModule],
  controllers: [ApmController, ApmCatalogController, ApmBookingController, ApmAvailabilityController],
  providers: [
    ApmService,
    ApmCatalogService,
    ApmBookingService,
    ApmNotificationsService,
    ApmBookingThrottlerGuard,
    ApmAppCheckGuard,
  ],
})
export class ApmModule {}

import { Module } from '@nestjs/common';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { MailModule } from '../../shared/mail/mail.module';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { DietMemberGuard, DietStaffGuard } from './diet-access.guards';
import { DietPortalController } from './diet-portal.controller';
import { DietPortalService } from './diet-portal.service';
import { DietStaffService } from './diet-staff.service';
import { DietController } from './diet.controller';
import { DietRepository } from './diet.repository';
import { DietService } from './diet.service';

@Module({
  imports: [IdentityModule, TenantModule, MailModule],
  controllers: [DietPortalController, DietController],
  providers: [
    DietService,
    DietPortalService,
    DietStaffService,
    DietRepository,
    FirebaseAppCheckGuard,
    SubscriptionGuard,
    DietStaffGuard,
    DietMemberGuard,
  ],
  exports: [DietService],
})
export class DietModule {}

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { FarmCoreController } from './core/farm-core.controller';
import { FarmCoreService } from './core/farm-core.service';
import { FarmOnboardingController, FarmOnboardingService } from './core/farm-onboarding';
import { FarmDataController } from './data/farm-data.controller';
import { FarmDataService } from './data/farm-data.service';
import { FarmMembersController, FarmMembersService } from './members/farm-members';
import { FarmStore } from './shared/farm-store';

/** Livestock farm product module — replaces the OdivonFARM client's direct Firestore access. */
@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [
    FarmCoreController,
    FarmOnboardingController,
    FarmMembersController,
    FarmDataController,
  ],
  providers: [FarmStore, FarmCoreService, FarmOnboardingService, FarmMembersService, FarmDataService],
})
export class FarmModule {}

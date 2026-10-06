import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { TenantModule } from '../tenant/tenant.module';
import { HairCoreController } from './core/hair-core.controller';
import { HairCoreService } from './core/hair-core.service';
import { HairOnboardingController, HairOnboardingService } from './core/hair-onboarding';
import { HairStore } from './shared/hair-store';

/**
 * Hair salon product module. Phase 1 (core): settings, branches, roles, onboarding.
 * Later phases register customers, catalog, staff, appointments, POS, finance, ... here.
 */
@Module({
  imports: [IdentityModule, TenantModule],
  controllers: [HairCoreController, HairOnboardingController],
  providers: [HairStore, HairCoreService, HairOnboardingService],
})
export class HairModule {}

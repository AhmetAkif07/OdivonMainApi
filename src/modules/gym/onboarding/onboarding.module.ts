import { Module } from '@nestjs/common';
import { TenantModule } from '../../tenant/tenant.module';
import { GymBranchesModule } from '../branches/branches.module';
import { GymInfoModule } from '../info/gym-info.module';
import { GymPackagesModule } from '../packages/packages.module';
import { GymStaffModule } from '../staff/staff.module';
import { GymOnboardingController } from './onboarding.controller';
import { GymOnboardingService } from './onboarding.service';

@Module({
  imports: [TenantModule, GymInfoModule, GymBranchesModule, GymStaffModule, GymPackagesModule],
  controllers: [GymOnboardingController],
  providers: [GymOnboardingService],
  exports: [GymOnboardingService],
})
export class GymOnboardingModule {}

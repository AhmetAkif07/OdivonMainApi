import { Module } from '@nestjs/common';
import { GymBranchesModule } from './branches/branches.module';
import { GymController } from './gym.controller';
import { GymInfoModule } from './info/gym-info.module';
import { GymMembersModule } from './members/members.module';
import { GymMobileModule } from './mobile/mobile.module';
import { GymOnboardingModule } from './onboarding/onboarding.module';
import { GymOpsModule } from './ops/ops.module';
import { GymPackagesModule } from './packages/packages.module';
import { GymStaffModule } from './staff/staff.module';

@Module({
  imports: [
    GymInfoModule,
    GymBranchesModule,
    GymStaffModule,
    GymPackagesModule,
    GymMembersModule,
    GymOnboardingModule,
    GymOpsModule,
    GymMobileModule,
  ],
  controllers: [GymController],
})
export class GymModule {}

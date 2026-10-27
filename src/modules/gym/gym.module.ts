import { Module } from '@nestjs/common';
import { GymAuditModule } from './audit/gym-audit.module';
import { GymBranchesModule } from './branches/branches.module';
import { GymController } from './gym.controller';
import { GymExercisesModule } from './exercises/exercises.module';
import { GymInfoModule } from './info/gym-info.module';
import { GymLeadsModule } from './leads/leads.module';
import { GymMembersModule } from './members/members.module';
import { GymMobileModule } from './mobile/mobile.module';
import { GymOnboardingModule } from './onboarding/onboarding.module';
import { GymOpsModule } from './ops/ops.module';
import { GymPackagesModule } from './packages/packages.module';
import { GymRemindersModule } from './reminders/reminders.module';
import { GymReportsModule } from './reports/reports.module';
import { GymConsentModule } from './consent/consent.module';
import { GymStaffModule } from './staff/staff.module';

@Module({
  imports: [
    GymAuditModule,
    GymInfoModule,
    GymBranchesModule,
    GymStaffModule,
    GymPackagesModule,
    GymMembersModule,
    GymOnboardingModule,
    GymOpsModule,
    GymExercisesModule,
    GymMobileModule,
    GymRemindersModule,
    GymLeadsModule,
    GymReportsModule,
    GymConsentModule,
  ],
  controllers: [GymController],
})
export class GymModule {}

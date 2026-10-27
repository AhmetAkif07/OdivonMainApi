import { Module } from '@nestjs/common';
import { GymAccessModule } from '../access/access.module';
import { PaymentsModule } from '../../payments/payments.module';
import { GymExercisesModule } from '../exercises/exercises.module';
import { GymLeadsModule } from '../leads/leads.module';
import { GymMembersModule } from '../members/members.module';
import { GymPackagesModule } from '../packages/packages.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymStaffModule } from '../staff/staff.module';
import { GymMemberGuard } from './gym-member.guard';
import { GymMobileController } from './mobile.controller';
import { GymMemberRecordsService } from './member-records.service';
import { GymMobileService } from './mobile.service';

@Module({
  imports: [
    GymMembersModule,
    GymPackagesModule,
    GymOpsModule,
    GymStaffModule,
    GymAccessModule,
    GymLeadsModule,
    GymExercisesModule,
    PaymentsModule,
  ],
  controllers: [GymMobileController],
  providers: [GymMemberGuard, GymMobileService, GymMemberRecordsService],
})
export class GymMobileModule {}

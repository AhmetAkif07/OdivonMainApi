import { Module } from '@nestjs/common';
import { GymMembersModule } from '../members/members.module';
import { GymPackagesModule } from '../packages/packages.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymStaffModule } from '../staff/staff.module';
import { GymMemberGuard } from './gym-member.guard';
import { GymMobileController } from './mobile.controller';
import { GymMobileService } from './mobile.service';

@Module({
  imports: [GymMembersModule, GymPackagesModule, GymOpsModule, GymStaffModule],
  controllers: [GymMobileController],
  providers: [GymMemberGuard, GymMobileService],
})
export class GymMobileModule {}

import { Module } from '@nestjs/common';
import { GymMembersModule } from '../members/members.module';
import { GymPackagesModule } from '../packages/packages.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymMemberGuard } from './gym-member.guard';
import { GymMobileController } from './mobile.controller';
import { GymMobileService } from './mobile.service';

@Module({
  imports: [GymMembersModule, GymPackagesModule, GymOpsModule],
  controllers: [GymMobileController],
  providers: [GymMemberGuard, GymMobileService],
})
export class GymMobileModule {}

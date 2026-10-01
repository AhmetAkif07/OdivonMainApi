import { Module } from '@nestjs/common';
import { GymBranchesModule } from '../branches/branches.module';
import { GymMembersModule } from '../members/members.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymReportsController } from './reports.controller';
import { GymReportsService } from './reports.service';

@Module({
  imports: [GymMembersModule, GymBranchesModule, GymOpsModule],
  controllers: [GymReportsController],
  providers: [GymReportsService],
})
export class GymReportsModule {}

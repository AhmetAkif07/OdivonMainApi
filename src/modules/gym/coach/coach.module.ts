import { Module } from '@nestjs/common';
import { GymMembersModule } from '../members/members.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymSignalsModule } from '../signals/signals.module';
import { GymCoachController } from './coach.controller';
import { GymCoachService } from './coach.service';

@Module({
  imports: [GymOpsModule, GymMembersModule, GymSignalsModule],
  controllers: [GymCoachController],
  providers: [GymCoachService],
})
export class GymCoachModule {}

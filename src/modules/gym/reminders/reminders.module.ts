import { Module } from '@nestjs/common';
import { GymMembersModule } from '../members/members.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymRemindersController } from './reminders.controller';
import { GymRemindersService } from './reminders.service';

@Module({
  imports: [GymMembersModule, GymOpsModule],
  controllers: [GymRemindersController],
  providers: [GymRemindersService],
  exports: [GymRemindersService],
})
export class GymRemindersModule {}

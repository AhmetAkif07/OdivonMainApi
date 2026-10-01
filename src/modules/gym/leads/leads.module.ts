import { Module } from '@nestjs/common';
import { GymOpsModule } from '../ops/ops.module';
import { GymLeadsController, GymReferralsController } from './leads.controller';
import { GymLeadsService } from './leads.service';

@Module({
  imports: [GymOpsModule],
  controllers: [GymLeadsController, GymReferralsController],
  providers: [GymLeadsService],
  exports: [GymLeadsService],
})
export class GymLeadsModule {}

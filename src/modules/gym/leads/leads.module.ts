import { Module } from '@nestjs/common';
import { GymAccessModule } from '../access/access.module';
import { GymOpsModule } from '../ops/ops.module';
import { GymLeadsController, GymReferralsController } from './leads.controller';
import { GymLeadsService } from './leads.service';

@Module({
  imports: [GymOpsModule, GymAccessModule],
  controllers: [GymLeadsController, GymReferralsController],
  providers: [GymLeadsService],
  exports: [GymLeadsService],
})
export class GymLeadsModule {}

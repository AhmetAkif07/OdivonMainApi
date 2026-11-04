import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { CommissionsController } from './commissions/commissions.controller';
import { CommissionRulesRepository, CommissionsService } from './commissions/commissions.service';
import { StaffController } from './staff.controller';
import { StaffLeavesRepository, StaffShiftsRepository } from './staff.repository';
import { StaffService } from './staff.service';

@Module({
  imports: [IdentityModule],
  controllers: [StaffController, CommissionsController],
  providers: [StaffShiftsRepository, StaffLeavesRepository, StaffService, CommissionRulesRepository, CommissionsService],
})
export class StaffModule {}

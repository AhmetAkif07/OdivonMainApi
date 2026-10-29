import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { StaffController } from './staff.controller';
import { StaffLeavesRepository, StaffShiftsRepository } from './staff.repository';
import { StaffService } from './staff.service';

@Module({
  imports: [IdentityModule],
  controllers: [StaffController],
  providers: [StaffShiftsRepository, StaffLeavesRepository, StaffService],
})
export class StaffModule {}

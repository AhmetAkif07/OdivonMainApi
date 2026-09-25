import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';

@Module({
  controllers: [StaffController],
  providers: [StaffRepository, StaffService],
  exports: [StaffRepository, StaffService],
})
export class GymStaffModule {}

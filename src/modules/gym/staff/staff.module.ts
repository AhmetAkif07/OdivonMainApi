import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { MailModule } from '../../../shared/mail/mail.module';
import { GymInfoModule } from '../info/gym-info.module';
import { StaffController } from './staff.controller';
import { StaffRepository } from './staff.repository';
import { StaffService } from './staff.service';

@Module({
  imports: [IdentityModule, MailModule, GymInfoModule],
  controllers: [StaffController],
  providers: [StaffRepository, StaffService],
  exports: [StaffRepository, StaffService],
})
export class GymStaffModule {}

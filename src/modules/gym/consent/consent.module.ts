import { Module } from '@nestjs/common';
import { GymMembersModule } from '../members/members.module';
import { GymStore } from '../shared/gym-store';
import { GymConsentController } from './consent.controller';
import { GymConsentService } from './consent.service';

@Module({
  imports: [GymMembersModule],
  controllers: [GymConsentController],
  providers: [GymStore, GymConsentService],
  exports: [GymConsentService],
})
export class GymConsentModule {}

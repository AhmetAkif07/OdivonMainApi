import { Module } from '@nestjs/common';
import { GymInfoController } from './gym-info.controller';
import { GymInfoRepository } from './gym-info.repository';
import { GymInfoService } from './gym-info.service';

@Module({
  controllers: [GymInfoController],
  providers: [GymInfoRepository, GymInfoService],
  exports: [GymInfoRepository, GymInfoService],
})
export class GymInfoModule {}

import { Module } from '@nestjs/common';
import { ParkingAgentGuard } from './access/parking-agent.guard';
import { ParkingAgentService } from './access/parking-agent.service';
import { ParkingAgentController, ParkingAgentEnrollController, ParkingController } from './parking.controller';
import { ParkingService } from './parking.service';

@Module({
  controllers: [ParkingController, ParkingAgentEnrollController, ParkingAgentController],
  providers: [ParkingService, ParkingAgentService, ParkingAgentGuard],
  exports: [ParkingService],
})
export class ParkingModule {}

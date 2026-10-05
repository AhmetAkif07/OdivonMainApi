import { Module } from '@nestjs/common';
import { AuditModule } from '../../../shared/audit/audit.module';
import { FirebaseModule } from '../../../shared/firebase/firebase.module';
import { TenancyModule } from '../../../shared/tenancy/tenancy.module';
import { CustomersModule } from '../customers/customers.module';
import { PatientsModule } from '../patients/patients.module';
import { HotelDailyLogsRepository } from './hotel-daily-logs.repository';
import { HotelRoomsRepository } from './hotel-rooms.repository';
import { HotelStaysRepository } from './hotel-stays.repository';
import { PetHotelController } from './pet-hotel.controller';
import { PetHotelService } from './pet-hotel.service';

@Module({
  imports: [
    FirebaseModule,
    TenancyModule,
    AuditModule,
    CustomersModule,
    PatientsModule,
  ],
  controllers: [PetHotelController],
  providers: [
    HotelRoomsRepository,
    HotelStaysRepository,
    HotelDailyLogsRepository,
    PetHotelService,
  ],
  exports: [
    HotelRoomsRepository,
    HotelStaysRepository,
    HotelDailyLogsRepository,
    PetHotelService,
  ],
})
export class PetHotelModule {}

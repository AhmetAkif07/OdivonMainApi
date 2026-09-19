import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsRepository } from './appointments.repository';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [CustomersModule, PatientsModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsRepository, AppointmentsService],
  exports: [AppointmentsRepository, AppointmentsService],
})
export class AppointmentsModule {}

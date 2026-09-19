import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { CustomersModule } from './customers/customers.module';
import { ExaminationsModule } from './examinations/examinations.module';
import { PatientsModule } from './patients/patients.module';

@Module({
  imports: [CustomersModule, PatientsModule, AppointmentsModule, ExaminationsModule],
})
export class VetModule {}

import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { FinanceModule } from '../finance/finance.module';
import { PatientsModule } from '../patients/patients.module';
import { AppointmentsController } from './appointments.controller';
import { AppointmentsRepository } from './appointments.repository';
import { AppointmentsService } from './appointments.service';

@Module({
  imports: [CustomersModule, PatientsModule, DefinitionsModule, FinanceModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsRepository, AppointmentsService],
  exports: [AppointmentsRepository, AppointmentsService],
})
export class AppointmentsModule {}

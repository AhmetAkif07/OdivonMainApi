import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { CustomersModule } from './customers/customers.module';
import { DefinitionsModule } from './definitions/definitions.module';
import { ExaminationsModule } from './examinations/examinations.module';
import { FinanceModule } from './finance/finance.module';
import { PatientsModule } from './patients/patients.module';
import { ClinicModule } from './clinic/clinic.module';
import { StockModule } from './stock/stock.module';

@Module({
  imports: [
    CustomersModule,
    PatientsModule,
    AppointmentsModule,
    ExaminationsModule,
    DefinitionsModule,
    FinanceModule,
    StockModule,
    ClinicModule,
  ],
})
export class VetModule {}

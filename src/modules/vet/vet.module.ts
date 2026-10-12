import { PurchasingModule } from './purchasing/purchasing.module';
import { BranchesModule } from './branches/branches.module';
import { Module } from '@nestjs/common';
import { AppointmentsModule } from './appointments/appointments.module';
import { CustomersModule } from './customers/customers.module';
import { DefinitionsModule } from './definitions/definitions.module';
import { ExaminationsModule } from './examinations/examinations.module';
import { FinanceModule } from './finance/finance.module';
import { PatientsModule } from './patients/patients.module';
import { ClinicModule } from './clinic/clinic.module';
import { StockModule } from './stock/stock.module';
import { HospitalizationModule } from './hospitalization/hospitalization.module';
import { ConsentsModule } from './consents/consents.module';
import { CrmModule } from './crm/crm.module';
import { PetHotelModule } from './pet-hotel/pet-hotel.module';
import { GroomingModule } from './grooming/grooming.module';
import { VetReportsModule } from './reports/reports.module';
import { VetAiModule } from './ai/ai.module';

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
    HospitalizationModule,
    ConsentsModule,
    CrmModule,
    PetHotelModule,
    GroomingModule,
    BranchesModule,
    VetReportsModule,
    VetAiModule,
    PurchasingModule,
  ],
})
export class VetModule {}

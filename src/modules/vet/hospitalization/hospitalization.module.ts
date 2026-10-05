import { Module } from '@nestjs/common';
import { AuditModule } from '../../../shared/audit/audit.module';
import { FirebaseModule } from '../../../shared/firebase/firebase.module';
import { TenancyModule } from '../../../shared/tenancy/tenancy.module';
import { CustomersModule } from '../customers/customers.module';
import { PatientsModule } from '../patients/patients.module';
import { HospitalizationController } from './hospitalization.controller';
import { HospitalizationRepository } from './hospitalization.repository';
import { HospitalizationService } from './hospitalization.service';

@Module({
  imports: [
    FirebaseModule,
    TenancyModule,
    AuditModule,
    CustomersModule,
    PatientsModule,
  ],
  controllers: [HospitalizationController],
  providers: [HospitalizationRepository, HospitalizationService],
  exports: [HospitalizationRepository, HospitalizationService],
})
export class HospitalizationModule {}

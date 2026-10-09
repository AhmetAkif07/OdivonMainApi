import { Module } from '@nestjs/common';
import { AuditModule } from '../../../shared/audit/audit.module';
import { FirebaseModule } from '../../../shared/firebase/firebase.module';
import { TenancyModule } from '../../../shared/tenancy/tenancy.module';
import { CustomersModule } from '../customers/customers.module';
import { PatientsModule } from '../patients/patients.module';
import { GroomingAppointmentsRepository } from './grooming-appointments.repository';
import { GroomingStaffRepository } from './grooming-staff.repository';
import { GroomingController } from './grooming.controller';
import { GroomingService } from './grooming.service';

@Module({
  imports: [
    FirebaseModule,
    TenancyModule,
    AuditModule,
    CustomersModule,
    PatientsModule,
  ],
  controllers: [GroomingController],
  providers: [
    GroomingAppointmentsRepository,
    GroomingStaffRepository,
    GroomingService,
  ],
  exports: [
    GroomingAppointmentsRepository,
    GroomingStaffRepository,
    GroomingService,
  ],
})
export class GroomingModule {}
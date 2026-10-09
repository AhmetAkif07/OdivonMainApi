import { Module, forwardRef } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PatientPublicController } from './patient-public.controller';
import { PatientsController } from './patients.controller';
import { PatientsRepository } from './patients.repository';
import { PatientsService } from './patients.service';

@Module({
  imports: [forwardRef(() => CustomersModule)],
  controllers: [PatientsController, PatientPublicController],
  providers: [PatientsRepository, PatientsService],
  exports: [PatientsRepository, PatientsService],
})
export class PatientsModule {}
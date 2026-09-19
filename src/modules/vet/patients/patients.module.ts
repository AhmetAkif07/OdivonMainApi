import { Module, forwardRef } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PatientsController } from './patients.controller';
import { PatientsRepository } from './patients.repository';
import { PatientsService } from './patients.service';

@Module({
  imports: [forwardRef(() => CustomersModule)],
  controllers: [PatientsController],
  providers: [PatientsRepository, PatientsService],
  exports: [PatientsRepository, PatientsService],
})
export class PatientsModule {}

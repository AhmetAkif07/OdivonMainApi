import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { PatientsModule } from '../patients/patients.module';
import { ExaminationsController } from './examinations.controller';
import { ExaminationsRepository } from './examinations.repository';
import { ExaminationsService } from './examinations.service';

@Module({
  imports: [CustomersModule, PatientsModule],
  controllers: [ExaminationsController],
  providers: [ExaminationsRepository, ExaminationsService],
  exports: [ExaminationsRepository, ExaminationsService],
})
export class ExaminationsModule {}

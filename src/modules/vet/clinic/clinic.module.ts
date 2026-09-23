import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { DefinitionsModule } from '../definitions/definitions.module';
import { PatientsModule } from '../patients/patients.module';
import { AgendaController } from './agenda/agenda.controller';
import { AgendaRepository } from './agenda/agenda.repository';
import { AgendaService } from './agenda/agenda.service';
import { FilesController } from './files/files.controller';
import { FilesRepository } from './files/files.repository';
import { FilesService } from './files/files.service';
import { LabDocumentsController } from './lab-documents/lab-documents.controller';
import { LabDocumentsRepository } from './lab-documents/lab-documents.repository';
import { LabDocumentsService } from './lab-documents/lab-documents.service';
import { ClinicParametersController } from './parameters/clinic-parameters.controller';
import { ClinicParametersRepository } from './parameters/clinic-parameters.repository';
import { ClinicParametersService } from './parameters/clinic-parameters.service';

@Module({
  imports: [CustomersModule, PatientsModule, DefinitionsModule],
  controllers: [AgendaController, LabDocumentsController, FilesController, ClinicParametersController],
  providers: [
    AgendaRepository,
    AgendaService,
    LabDocumentsRepository,
    LabDocumentsService,
    FilesRepository,
    FilesService,
    ClinicParametersRepository,
    ClinicParametersService,
  ],
})
export class ClinicModule {}



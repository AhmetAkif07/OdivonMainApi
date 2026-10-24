import { Module } from '@nestjs/common';
import { FgasController } from './fgas.controller';
import { FgasRepository } from './fgas.repository';
import { FgasService } from './fgas.service';

@Module({ controllers: [FgasController], providers: [FgasService, FgasRepository], exports: [FgasService] })
export class FgasModule {}

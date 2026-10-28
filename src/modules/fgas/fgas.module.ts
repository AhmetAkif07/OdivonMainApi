import { Module } from '@nestjs/common';
import { FgasController } from './fgas.controller';
import { FgasRepository } from './fgas.repository';
import { FgasService } from './fgas.service';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';

@Module({
  controllers: [FgasController],
  providers: [FgasService, FgasRepository, FirebaseAppCheckGuard, SubscriptionGuard],
  exports: [FgasService],
})
export class FgasModule {}

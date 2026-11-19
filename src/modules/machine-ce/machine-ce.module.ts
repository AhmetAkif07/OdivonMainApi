import { Module } from '@nestjs/common';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { MachineCeAiService } from './machine-ce-ai.service';
import { MachineCeController } from './machine-ce.controller';
import { MachineCeRepository } from './machine-ce.repository';
import { MachineCeService } from './machine-ce.service';

@Module({
  controllers: [MachineCeController],
  providers: [
    MachineCeService,
    MachineCeRepository,
    MachineCeAiService,
    FirebaseAppCheckGuard,
    SubscriptionGuard,
  ],
  exports: [MachineCeService],
})
export class MachineCeModule {}

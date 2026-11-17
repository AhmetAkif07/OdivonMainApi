import { Module } from '@nestjs/common';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { IdentityModule } from '../identity/identity.module';
import { DietController } from './diet.controller';
import { DietRepository } from './diet.repository';
import { DietService } from './diet.service';

@Module({
  imports: [IdentityModule],
  controllers: [DietController],
  providers: [DietService, DietRepository, FirebaseAppCheckGuard, SubscriptionGuard],
  exports: [DietService],
})
export class DietModule {}

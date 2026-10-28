import { Module } from '@nestjs/common';
import { FireSafeController } from './fire-safe.controller';
import { FireSafeRepository } from './fire-safe.repository';
import { FireSafeService } from './fire-safe.service';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';

@Module({
  controllers: [FireSafeController],
  providers: [FireSafeService, FireSafeRepository, FirebaseAppCheckGuard, SubscriptionGuard],
  exports: [FireSafeService],
})
export class FireSafeModule {}

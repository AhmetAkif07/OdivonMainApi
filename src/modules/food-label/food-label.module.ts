import { Module } from '@nestjs/common';
import { FoodLabelController } from './food-label.controller';
import { FoodLabelRepository } from './food-label.repository';
import { FoodLabelService } from './food-label.service';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';

@Module({
  controllers: [FoodLabelController],
  providers: [FoodLabelService, FoodLabelRepository, FirebaseAppCheckGuard, SubscriptionGuard],
  exports: [FoodLabelService],
})
export class FoodLabelModule {}

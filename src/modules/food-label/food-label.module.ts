import { Module } from '@nestjs/common';
import { FoodLabelController } from './food-label.controller';
import { FoodLabelRepository } from './food-label.repository';
import { FoodLabelService } from './food-label.service';

@Module({ controllers: [FoodLabelController], providers: [FoodLabelService, FoodLabelRepository], exports: [FoodLabelService] })
export class FoodLabelModule {}

import { Module } from '@nestjs/common';
import { GymOpsModule } from '../ops/ops.module';
import { GymExercisesController } from './exercises.controller';
import { GymExercisesService } from './exercises.service';

@Module({
  imports: [GymOpsModule],
  controllers: [GymExercisesController],
  providers: [GymExercisesService],
  exports: [GymExercisesService],
})
export class GymExercisesModule {}

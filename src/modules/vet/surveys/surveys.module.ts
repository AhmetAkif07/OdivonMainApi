import { Module } from '@nestjs/common';
import { PublicSurveysController, PublicSurveyThrottlerGuard, SurveysController } from './surveys.controller';
import { SurveysRepository } from './surveys.repository';
import { SurveysService } from './surveys.service';

@Module({
  controllers: [SurveysController, PublicSurveysController],
  providers: [SurveysRepository, SurveysService, PublicSurveyThrottlerGuard],
})
export class SurveysModule {}

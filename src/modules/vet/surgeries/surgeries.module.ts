import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { SurgeriesController } from './surgeries.controller';
import { SurgeriesRepository, SurgeriesService } from './surgeries.service';

@Module({
  imports: [IdentityModule],
  controllers: [SurgeriesController],
  providers: [SurgeriesRepository, SurgeriesService],
})
export class SurgeriesModule {}

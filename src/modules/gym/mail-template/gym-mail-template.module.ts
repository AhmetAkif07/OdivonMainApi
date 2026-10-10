import { Module } from '@nestjs/common';
import { GymMailTemplateController } from './gym-mail-template.controller';
import { GymMailTemplateRepository } from './gym-mail-template.repository';
import { GymMailTemplateService } from './gym-mail-template.service';

@Module({
  controllers: [GymMailTemplateController],
  providers: [GymMailTemplateRepository, GymMailTemplateService],
  exports: [GymMailTemplateRepository, GymMailTemplateService],
})
export class GymMailTemplateModule {}

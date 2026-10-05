import { Module } from '@nestjs/common';
import { ConsentFormsController } from './consent-forms.controller';
import { ConsentFormsRepository } from './consent-forms.repository';
import { ConsentFormsService } from './consent-forms.service';

@Module({
  controllers: [ConsentFormsController],
  providers: [ConsentFormsRepository, ConsentFormsService],
  exports: [ConsentFormsService],
})
export class ConsentsModule {}

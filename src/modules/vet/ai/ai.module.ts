import { Module } from '@nestjs/common';
import { VetAiController } from './ai.controller';
import { VetAiService } from './ai.service';

@Module({
  controllers: [VetAiController],
  providers: [VetAiService],
  exports: [VetAiService],
})
export class VetAiModule {}

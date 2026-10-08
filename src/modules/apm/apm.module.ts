import { Module } from '@nestjs/common';
import { ApmController } from './apm.controller';
import { ApmService } from './apm.service';

@Module({
  controllers: [ApmController],
  providers: [ApmService],
})
export class ApmModule {}

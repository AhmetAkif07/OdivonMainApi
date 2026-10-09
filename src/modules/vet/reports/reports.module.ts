import { Module } from '@nestjs/common';
import { VetReportsController } from './reports.controller';
import { VetReportsService } from './reports.service';

@Module({
  controllers: [VetReportsController],
  providers: [VetReportsService],
  exports: [VetReportsService],
})
export class VetReportsModule {}

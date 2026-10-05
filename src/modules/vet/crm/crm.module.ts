import { Module } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmRepository } from './crm.repository';
import { CrmService } from './crm.service';

@Module({
  controllers: [CrmController],
  providers: [CrmRepository, CrmService],
  exports: [CrmService],
})
export class CrmModule {}

import { Module } from '@nestjs/common';
import { TenantRepository } from './tenant.repository';
import { TenantService } from './tenant.service';

@Module({
  providers: [TenantRepository, TenantService],
  exports: [TenantService, TenantRepository],
})
export class TenantModule {}

import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';

@Module({
  imports: [TenantModule],
  controllers: [IdentityController],
  providers: [IdentityRepository, IdentityService],
  exports: [IdentityRepository, IdentityService],
})
export class IdentityModule {}

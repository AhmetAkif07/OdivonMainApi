import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { IdentityController, RegisterThrottlerGuard } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { RolesController } from './roles/roles.controller';
import { RolesRepository } from './roles/roles.repository';
import { RolesService } from './roles/roles.service';

@Module({
  imports: [TenantModule],
  controllers: [IdentityController, RolesController],
  providers: [IdentityRepository, IdentityService, RolesRepository, RolesService, RegisterThrottlerGuard],
  exports: [IdentityRepository, IdentityService],
})
export class IdentityModule {}

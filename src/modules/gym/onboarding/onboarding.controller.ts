import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CompleteOnboardingDto } from './onboarding.dto';
import { GymOnboardingService } from './onboarding.service';

@ApiTags('gym-onboarding')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Roles('owner', 'admin')
@Controller('gym/onboarding')
export class GymOnboardingController {
  constructor(private readonly onboarding: GymOnboardingService) {}

  @Post('defaults')
  @RequirePermission('gymInfo', 'update')
  @ApiOperation({ summary: 'Seed default gym branch and packages if missing' })
  defaults() {
    return this.onboarding.ensureDefaults();
  }

  @Post('complete')
  @RequirePermission('gymInfo', 'update')
  @ApiOperation({ summary: 'Complete gym tenant wizard' })
  complete(@Body() dto: CompleteOnboardingDto) {
    return this.onboarding.complete(dto);
  }
}

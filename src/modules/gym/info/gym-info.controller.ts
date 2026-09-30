import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { PatchGymInfoDto } from './gym-info.dto';
import { GymInfoService } from './gym-info.service';

@ApiTags('gym-info')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/info')
export class GymInfoController {
  constructor(private readonly info: GymInfoService) {}

  @Get()
  @RequirePermission('gymInfo', 'view')
  @ApiOperation({ summary: 'Get gym info for the current tenant' })
  get() {
    return this.info.get();
  }

  @Patch()
  @Roles('owner', 'admin')
  @RequirePermission('gymInfo', 'update')
  @ApiOperation({ summary: 'Create or update gym info' })
  patch(@Body() dto: PatchGymInfoDto) {
    return this.info.upsert(dto);
  }
}

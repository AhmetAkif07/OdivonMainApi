import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { UpdateGymMailTemplateDto } from './gym-mail-template.dto';
import { GymMailTemplateService } from './gym-mail-template.service';

@ApiTags('gym-mail-template')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/mail-template')
export class GymMailTemplateController {
  constructor(private readonly service: GymMailTemplateService) {}

  @Get()
  @RequirePermission('gymInfo', 'view')
  @ApiOperation({ summary: 'Get welcome member mail template configuration' })
  get() {
    return this.service.getTemplate();
  }

  @Put()
  @Roles('owner', 'admin')
  @RequirePermission('gymInfo', 'update')
  @ApiOperation({ summary: 'Update welcome member mail template configuration' })
  update(@Body() dto: UpdateGymMailTemplateDto) {
    return this.service.updateTemplate(dto);
  }
}

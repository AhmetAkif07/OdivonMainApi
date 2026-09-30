import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { ListGymAuditQueryDto } from './gym-audit.dto';
import { GymAuditService } from './gym-audit.service';

/** Read-only: audit entries are written by GymAuditInterceptor and can never be edited or deleted via the API. */
@ApiTags('gym-audit')
@ApiBearerAuth()
@RequireModule('gym')
@Roles('owner', 'admin')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/audit-logs')
export class GymAuditController {
  constructor(private readonly audit: GymAuditService) {}

  @Get()
  @RequirePermission('gymAudit', 'view')
  @ApiOperation({ summary: 'İşlem kaydı: kim, ne zaman, neyi değiştirdi' })
  list(@Query() query: ListGymAuditQueryDto) {
    return this.audit.list(query);
  }
}

import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { MemberHistoryQueryDto } from './gym-audit.dto';
import { GymAuditService } from './gym-audit.service';

/**
 * A member's change history (the "Geçmiş" tab): read from the same `gymAuditLogs` the interceptor
 * writes, but limited to one member and open to anyone who may view members.
 */
@ApiTags('gym-members')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('gym/members')
export class GymMemberHistoryController {
  constructor(private readonly audit: GymAuditService) {}

  @Get(':id/history')
  @RequirePermission('members', 'view')
  @ApiOperation({ summary: 'Üye geçmişi: kim, ne zaman, neyi değiştirdi' })
  history(@Param('id') id: string, @Query() query: MemberHistoryQueryDto) {
    return this.audit.memberHistory(id, query.limit ?? 100, query.before);
  }
}

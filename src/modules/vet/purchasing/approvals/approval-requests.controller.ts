import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { DecideApprovalDto, ListApprovalRequestsQueryDto, SubmitApprovalDto } from './approval-request.dto';
import { ApprovalRequestsService } from './approval-requests.service';

@ApiTags('vet-purchasing-approvals')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/purchasing/approvals')
export class ApprovalRequestsController {
  constructor(private readonly service: ApprovalRequestsService) {}

  @Get()
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'List all approval requests' })
  list(@Query() query: ListApprovalRequestsQueryDto) {
    return this.service.list(query);
  }

  @Get('inbox')
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'List requests pending user decision' })
  getInbox() {
    return this.service.getInbox();
  }

  @Get(':id')
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'Get approval request with step progression and audit history' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post('submit')
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Submit document into multi-tier approval workflow' })
  submit(@Body() dto: SubmitApprovalDto) {
    return this.service.submit(dto);
  }

  @Post(':id/decide')
  @RequirePermission('demands', 'update')
  @ApiOperation({ summary: 'Approve, reject or return document with feedback' })
  decide(@Param('id') id: string, @Body() dto: DecideApprovalDto) {
    return this.service.decide(id, dto);
  }
}

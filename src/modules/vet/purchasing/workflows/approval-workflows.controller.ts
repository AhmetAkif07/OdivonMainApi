import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateApprovalWorkflowDto, UpdateApprovalWorkflowDto } from './approval-workflow.dto';
import { ApprovalWorkflowsService } from './approval-workflows.service';

@ApiTags('vet-purchasing-workflows')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/purchasing/workflows')
export class ApprovalWorkflowsController {
  constructor(private readonly service: ApprovalWorkflowsService) {}

  @Get()
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'List all approval workflow scenarios' })
  list() {
    return this.service.list();
  }

  @Get('seed')
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Seed default enterprise approval workflows' })
  seed() {
    return this.service.seedDefaultWorkflows();
  }

  @Get(':id')
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'Get workflow detail' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Create new approval workflow scenario' })
  create(@Body() dto: CreateApprovalWorkflowDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermission('demands', 'update')
  @ApiOperation({ summary: 'Update approval workflow scenario' })
  update(@Param('id') id: string, @Body() dto: UpdateApprovalWorkflowDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('demands', 'delete')
  @ApiOperation({ summary: 'Delete approval workflow scenario' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}

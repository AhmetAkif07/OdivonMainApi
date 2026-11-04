import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CommissionReportQueryDto, CreateCommissionRuleDto, UpdateCommissionRuleDto } from './commission.dto';
import { CommissionsService } from './commissions.service';

@ApiTags('vet-staff-commissions')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/staff/commissions')
export class CommissionsController {
  constructor(private readonly service: CommissionsService) {}

  @Get('rules')
  @RequirePermission('staffCommissions', 'view')
  list() {
    return this.service.list();
  }

  @Post('rules')
  @RequirePermission('staffCommissions', 'create')
  create(@Body() dto: CreateCommissionRuleDto) {
    return this.service.create(dto);
  }

  @Patch('rules/:id')
  @RequirePermission('staffCommissions', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateCommissionRuleDto) {
    return this.service.update(id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission('staffCommissions', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { id };
  }

  @Get('report')
  @ApiOperation({ summary: 'Per-person net sales, commissions and target bonuses for a period' })
  @RequirePermission('staffCommissions', 'view')
  report(@Query() query: CommissionReportQueryDto) {
    return this.service.report(query);
  }
}

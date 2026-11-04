import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateSurgeryDto, SurgeryQueryDto, UpdateSurgeryDto } from './surgery.dto';
import { SurgeriesService } from './surgeries.service';

@ApiTags('vet-surgeries')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/surgeries')
export class SurgeriesController {
  constructor(private readonly service: SurgeriesService) {}

  @Get()
  @ApiOperation({ summary: 'Surgeries, newest first; filter by patient, status or date range' })
  @RequirePermission('surgeries', 'view')
  list(@Query() query: SurgeryQueryDto) {
    return this.service.list(query);
  }

  @Get('checklist-template')
  @ApiOperation({ summary: 'Standard pre-op checklist used for new surgeries' })
  @RequirePermission('surgeries', 'view')
  checklistTemplate() {
    return this.service.checklistTemplate();
  }

  @Post()
  @RequirePermission('surgeries', 'create')
  create(@Body() dto: CreateSurgeryDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('surgeries', 'view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermission('surgeries', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSurgeryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('surgeries', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { id };
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateDemandDto, ListDemandsQueryDto, UpdateDemandDto } from './demand.dto';
import { DemandsService } from './demands.service';

@ApiTags('vet-demands')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/demands')
export class DemandsController {
  constructor(private readonly service: DemandsService) {}

  @Get()
  @RequirePermission('demands', 'view')
  list(@Query() query: ListDemandsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermission('demands', 'create')
  create(@Body() dto: CreateDemandDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('demands', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @RequirePermission('demands', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateDemandDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('demands', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

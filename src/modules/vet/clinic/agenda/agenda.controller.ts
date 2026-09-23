import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateAgendaDto, UpdateAgendaDto } from './agenda.dto';
import { AgendaService } from './agenda.service';

@ApiTags('vet-agenda')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/agenda')
export class AgendaController {
  constructor(private readonly service: AgendaService) {}

  @Get()
  @RequirePermission('agenda', 'view')
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermission('agenda', 'create')
  create(@Body() dto: CreateAgendaDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('agenda', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @RequirePermission('agenda', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateAgendaDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('agenda', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

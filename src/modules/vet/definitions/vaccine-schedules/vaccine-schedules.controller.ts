import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateVaccineScheduleDto, ListVaccineSchedulesQueryDto, UpdateVaccineScheduleDto } from './vaccine-schedule.dto';
import { VaccineSchedulesService } from './vaccine-schedules.service';

@ApiTags('vet-vaccine-schedules')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/vaccine-schedules')
export class VaccineSchedulesController {
  constructor(private readonly service: VaccineSchedulesService) {}

  @Get()

  @RequirePermission('vaccineSchedules', 'view')
  @ApiOperation({ summary: 'List patient vaccine schedule entries' })
  list(@Query() query: ListVaccineSchedulesQueryDto) {
    return this.service.list(query);
  }

  @Post()

  @RequirePermission('vaccineSchedules', 'create')
  @ApiOperation({ summary: 'Add a vaccine to a patient schedule' })
  create(@Body() dto: CreateVaccineScheduleDto) {
    return this.service.create(dto);
  }

  @Get(':id')

  @RequirePermission('vaccineSchedules', 'view')
  @ApiOperation({ summary: 'Get a vaccine schedule entry' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')

  @RequirePermission('vaccineSchedules', 'update')
  @ApiOperation({ summary: 'Update a vaccine schedule entry' })
  update(@Param('id') id: string, @Body() dto: UpdateVaccineScheduleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('vaccineSchedules', 'delete')
  @ApiOperation({ summary: 'Soft-delete a vaccine schedule entry' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

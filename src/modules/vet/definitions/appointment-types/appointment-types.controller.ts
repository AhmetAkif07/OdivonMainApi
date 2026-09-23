import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateAppointmentTypeDto, UpdateAppointmentTypeDto } from './appointment-type.dto';
import { AppointmentTypesService } from './appointment-types.service';

@ApiTags('vet-appointment-types')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/appointment-types')
export class AppointmentTypesController {
  constructor(private readonly service: AppointmentTypesService) {}

  @Get()
  @ApiOperation({ summary: 'List appointment types' })
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an appointment type' })
  create(@Body() dto: CreateAppointmentTypeDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment type by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an appointment type' })
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an appointment type' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

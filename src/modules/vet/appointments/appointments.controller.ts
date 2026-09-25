import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { CompleteAppointmentDto } from './dto/complete-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('vet-appointments')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()

  @RequirePermission('appointments', 'view')
  @ApiOperation({ summary: 'List appointments in the current tenant' })
  list(@Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(query);
  }

  @Post()

  @RequirePermission('appointments', 'create')
  @ApiOperation({ summary: 'Create an appointment with atomic doctor slot reservation' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  @Get(':id')

  @RequirePermission('appointments', 'view')
  @ApiOperation({ summary: 'Get appointment by id' })
  get(@Param('id') id: string) {
    return this.appointments.getById(id);
  }

  @Patch(':id/status')

  @RequirePermission('appointments', 'update')
  @ApiOperation({ summary: 'Update appointment status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAppointmentStatusDto) {
    return this.appointments.updateStatus(id, dto.status);
  }

  @Post(':id/complete')

  @RequirePermission('appointments', 'update')
  @ApiOperation({ summary: 'Complete an appointment and optionally create a sale' })
  complete(@Param('id') id: string, @Body() dto: CompleteAppointmentDto) {
    return this.appointments.complete(id, dto);
  }

  @Patch(':id')

  @RequirePermission('appointments', 'update')
  @ApiOperation({ summary: 'Update an appointment' })
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('appointments', 'delete')
  @ApiOperation({ summary: 'Soft-delete an appointment and release reserved slots' })
  async remove(@Param('id') id: string) {
    await this.appointments.softDelete(id);
    return { id };
  }
}

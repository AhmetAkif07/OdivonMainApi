import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { AppointmentsService } from './appointments.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { UpdateAppointmentStatusDto } from './dto/update-appointment-status.dto';

@ApiTags('vet-appointments')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @ApiOperation({ summary: 'List appointments in the current tenant' })
  list(@Query() query: ListAppointmentsQueryDto) {
    return this.appointments.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create an appointment with atomic doctor slot reservation' })
  create(@Body() dto: CreateAppointmentDto) {
    return this.appointments.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get appointment by id' })
  get(@Param('id') id: string) {
    return this.appointments.getById(id);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update appointment status' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateAppointmentStatusDto) {
    return this.appointments.updateStatus(id, dto.status);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an appointment' })
  update(@Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointments.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete an appointment and release reserved slots' })
  async remove(@Param('id') id: string) {
    await this.appointments.softDelete(id);
    return { id };
  }
}

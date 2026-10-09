import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { SaveHairAppointmentDto, SetHairAppointmentStatusDto } from './appointment.dto';
import { HairAppointmentsService } from './hair-appointments.service';

@ApiTags('hair-appointments')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/appointments')
export class HairAppointmentsController {
  constructor(private readonly appointments: HairAppointmentsService) {}

  @Get()
  @RequirePermission('hairAppointments', 'view')
  @ApiOperation({ summary: 'Appointments with from <= startAt < to (UTC ISO); staffId, branchId, customerId, status, date' })
  list(@Query() query: HairListQueryDto) {
    return this.appointments.list(query);
  }

  @Get(':id')
  @RequirePermission('hairAppointments', 'view')
  get(@Param('id') id: string) {
    return this.appointments.get(id);
  }

  @Post()
  @RequirePermission('hairAppointments', 'create')
  @ApiOperation({ summary: 'Create appointment; server computes times, prices and checks conflicts (409)' })
  create(@Body() dto: SaveHairAppointmentDto) {
    return this.appointments.save(dto);
  }

  @Patch(':id')
  @RequirePermission('hairAppointments', 'update')
  update(@Param('id') id: string, @Body() dto: SaveHairAppointmentDto) {
    return this.appointments.save(dto, id);
  }

  @Patch(':id/status')
  @RequirePermission('hairAppointments', 'update')
  @ApiOperation({ summary: 'Change status (confirm, check-in, start, complete, cancel, no-show)' })
  setStatus(@Param('id') id: string, @Body() dto: SetHairAppointmentStatusDto) {
    return this.appointments.setStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairAppointments', 'delete')
  @ApiOperation({ summary: 'Soft-delete an erroneous record (cancel via status instead, R-014)' })
  remove(@Param('id') id: string) {
    return this.appointments.remove(id);
  }
}

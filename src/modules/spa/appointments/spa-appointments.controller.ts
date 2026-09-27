import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { SpaGuards } from '../shared/spa-guards';
import { SpaListQueryDto } from '../shared/spa-list.dto';
import { SaveSpaAppointmentDto, SetSpaAppointmentStatusDto } from './appointment.dto';
import { SpaAppointmentsService } from './spa-appointments.service';

@ApiTags('spa-appointments')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/appointments')
export class SpaAppointmentsController {
  constructor(private readonly appointments: SpaAppointmentsService) {}

  @Get()
  @RequirePermission('spaAppointments', 'view')
  @ApiOperation({ summary: 'Appointments whose start is in [from, to)' })
  list(@Query() query: SpaListQueryDto) {
    return this.appointments.list(query.from, query.to, query.staffId, query.customerId);
  }

  @Get(':id')
  @RequirePermission('spaAppointments', 'view')
  get(@Param('id') id: string) {
    return this.appointments.get(id);
  }

  @Post()
  @RequirePermission('spaAppointments', 'create')
  create(@Body() dto: SaveSpaAppointmentDto) {
    return this.appointments.save(dto);
  }

  @Patch(':id')
  @RequirePermission('spaAppointments', 'update')
  update(@Param('id') id: string, @Body() dto: SaveSpaAppointmentDto) {
    return this.appointments.save(dto, id);
  }

  @Patch(':id/status')
  @RequirePermission('spaAppointments', 'update')
  setStatus(@Param('id') id: string, @Body() dto: SetSpaAppointmentStatusDto) {
    return this.appointments.setStatus(id, dto);
  }
}

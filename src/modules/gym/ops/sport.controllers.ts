import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';
import { GymSportService } from './sport.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard] as const;

@ApiTags('gym-classes')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/classes')
export class GymClassesController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('classes', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listClasses(query);
  }

  @Post()
  @RequirePermission('classes', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createClass(dto);
  }

  @Get('bookings')
  @RequirePermission('classes', 'view')
  bookings(@Query() query: GymListQueryDto) {
    return this.sport.listBookings(query);
  }

  @Get(':id')
  @RequirePermission('classes', 'view')
  get(@Param('id') id: string) {
    return this.sport.getClass(id);
  }

  @Patch(':id')
  @RequirePermission('classes', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateClass(id, dto);
  }

  @Delete(':id')
  @RequirePermission('classes', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeClass(id);
  }

  @Post(':id/bookings')
  @RequirePermission('classes', 'create')
  book(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.bookClass(id, dto);
  }

  @Patch(':id/members')
  @RequirePermission('classes', 'update')
  assign(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.assignMembers(id, dto);
  }

  @Delete(':id/bookings/:bookingId')
  @RequirePermission('classes', 'delete')
  cancelBooking(@Param('bookingId') bookingId: string) {
    return this.sport.cancelBooking(bookingId);
  }
}

@ApiTags('gym-appointments')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/appointments')
export class GymAppointmentsController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('gymAppointments', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listAppointments(query);
  }

  @Post()
  @RequirePermission('gymAppointments', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createAppointment(dto);
  }

  @Patch(':id')
  @RequirePermission('gymAppointments', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateAppointment(id, dto);
  }

  @Post(':id/complete')
  @RequirePermission('gymAppointments', 'update')
  complete(@Param('id') id: string) {
    return this.sport.completeAppointment(id);
  }

  @Post(':id/cancel')
  @RequirePermission('gymAppointments', 'update')
  cancel(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.cancelAppointment(id, dto);
  }

  @Delete(':id')
  @RequirePermission('gymAppointments', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeAppointment(id);
  }
}

@ApiTags('gym-workouts')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/workouts')
export class GymWorkoutsController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('workouts', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listWorkouts(query);
  }

  @Post()
  @RequirePermission('workouts', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createWorkout(dto);
  }

  @Patch(':id')
  @RequirePermission('workouts', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateWorkout(id, dto);
  }

  @Delete(':id')
  @RequirePermission('workouts', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeWorkout(id);
  }
}

@ApiTags('gym-workout-templates')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/workout-templates')
export class GymWorkoutTemplatesController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('workouts', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listTemplates(query);
  }

  @Post()
  @RequirePermission('workouts', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createTemplate(dto);
  }

  @Patch(':id')
  @RequirePermission('workouts', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateTemplate(id, dto);
  }

  @Delete(':id')
  @RequirePermission('workouts', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeTemplate(id);
  }
}

@ApiTags('gym-measurements')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/measurements')
export class GymMeasurementsController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('measurements', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listMeasurements(query);
  }

  @Post()
  @RequirePermission('measurements', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createMeasurement(dto);
  }

  @Patch(':id')
  @RequirePermission('measurements', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateMeasurement(id, dto);
  }

  @Delete(':id')
  @RequirePermission('measurements', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeMeasurement(id);
  }
}

@ApiTags('gym-water')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/water')
export class GymWaterController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('water', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listWater(query);
  }

  @Post()
  @RequirePermission('water', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createWater(dto);
  }

  @Patch(':id')
  @RequirePermission('water', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateWater(id, dto);
  }

  @Delete(':id')
  @RequirePermission('water', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeWater(id);
  }
}

@ApiTags('gym-guests')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/guest-members')
export class GymGuestsController {
  constructor(private readonly sport: GymSportService) {}

  @Get()
  @RequirePermission('guestMembers', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.sport.listGuests(query);
  }

  @Post()
  @RequirePermission('guestMembers', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.sport.createGuest(dto);
  }

  @Patch(':id')
  @RequirePermission('guestMembers', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateGuest(id, dto);
  }

  @Delete(':id')
  @RequirePermission('guestMembers', 'delete')
  remove(@Param('id') id: string) {
    return this.sport.removeGuest(id);
  }
}

@ApiTags('gym-catalog')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym')
export class GymCatalogController {
  constructor(private readonly sport: GymSportService) {}

  @Get('disciplines')
  @RequirePermission('disciplines', 'view')
  listDisciplines(@Query() query: GymListQueryDto) {
    return this.sport.listDisciplines(query);
  }

  @Post('disciplines')
  @RequirePermission('disciplines', 'create')
  createDiscipline(@Body() dto: GymRecordDto) {
    return this.sport.createDiscipline(dto);
  }

  @Patch('disciplines/:id')
  @RequirePermission('disciplines', 'update')
  updateDiscipline(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateDiscipline(id, dto);
  }

  @Delete('disciplines/:id')
  @RequirePermission('disciplines', 'delete')
  removeDiscipline(@Param('id') id: string) {
    return this.sport.removeDiscipline(id);
  }

  @Get('facilities')
  @RequirePermission('disciplines', 'view')
  listFacilities(@Query() query: GymListQueryDto) {
    return this.sport.listFacilities(query);
  }

  @Post('facilities')
  @RequirePermission('disciplines', 'create')
  createFacility(@Body() dto: GymRecordDto) {
    return this.sport.createFacility(dto);
  }

  @Patch('facilities/:id')
  @RequirePermission('disciplines', 'update')
  updateFacility(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateFacility(id, dto);
  }

  @Delete('facilities/:id')
  @RequirePermission('disciplines', 'delete')
  removeFacility(@Param('id') id: string) {
    return this.sport.removeFacility(id);
  }

  @Get('equipment')
  @RequirePermission('disciplines', 'view')
  listEquipment(@Query() query: GymListQueryDto) {
    return this.sport.listEquipment(query);
  }

  @Post('equipment')
  @RequirePermission('disciplines', 'create')
  createEquipment(@Body() dto: GymRecordDto) {
    return this.sport.createEquipment(dto);
  }

  @Patch('equipment/:id')
  @RequirePermission('disciplines', 'update')
  updateEquipment(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.sport.updateEquipment(id, dto);
  }

  @Delete('equipment/:id')
  @RequirePermission('disciplines', 'delete')
  removeEquipment(@Param('id') id: string) {
    return this.sport.removeEquipment(id);
  }
}

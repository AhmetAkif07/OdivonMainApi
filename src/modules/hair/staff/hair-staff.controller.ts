import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairStaffService } from './hair-staff.service';
import {
  CreateHairShiftDto,
  CreateHairStaffDto,
  CreateHairTimeOffDto,
  InviteHairStaffDto,
  StaffScheduleQueryDto,
  UpdateHairShiftDto,
  UpdateHairStaffDto,
  UpdateHairTimeOffDto,
} from './staff.dto';

@ApiTags('hair-staff')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/staff')
export class HairStaffController {
  constructor(private readonly staff: HairStaffService) {}

  @Get()
  @RequirePermission('hairStaff', 'view')
  @ApiOperation({ summary: 'Staff; filters: branchId, type (= role), status=active|inactive, search' })
  list(@Query() query: HairListQueryDto) {
    return this.staff.list(query);
  }

  @Get(':id')
  @RequirePermission('hairStaff', 'view')
  get(@Param('id') id: string) {
    return this.staff.get(id);
  }

  @Get(':id/schedule')
  @RequirePermission('hairStaff', 'view')
  @ApiOperation({ summary: '{ staff, shifts, timeOff, appointments } in [from, to] (YYYY-MM-DD)' })
  schedule(@Param('id') id: string, @Query() query: StaffScheduleQueryDto) {
    return this.staff.schedule(id, query);
  }

  @Post()
  @RequirePermission('hairStaff', 'create')
  create(@Body() dto: CreateHairStaffDto) {
    return this.staff.create(dto);
  }

  @Post(':id/invite')
  @RequirePermission('hairStaff', 'create')
  @ApiOperation({ summary: 'Create a panel account for the staff member; returns a password reset link' })
  invite(@Param('id') id: string, @Body() dto: InviteHairStaffDto) {
    return this.staff.invite(id, dto);
  }

  @Patch(':id')
  @RequirePermission('hairStaff', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairStaffDto) {
    return this.staff.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairStaff', 'delete')
  remove(@Param('id') id: string) {
    return this.staff.remove(id);
  }
}

@ApiTags('hair-staff')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/shifts')
export class HairShiftsController {
  constructor(private readonly staff: HairStaffService) {}

  @Get()
  @RequirePermission('hairStaff', 'view')
  @ApiOperation({ summary: 'Shifts with from <= date <= to (YYYY-MM-DD); staffId, branchId' })
  list(@Query() query: HairListQueryDto) {
    return this.staff.listShifts(query);
  }

  @Post()
  @RequirePermission('hairStaff', 'create')
  create(@Body() dto: CreateHairShiftDto) {
    return this.staff.createShift(dto);
  }

  @Patch(':id')
  @RequirePermission('hairStaff', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairShiftDto) {
    return this.staff.updateShift(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairStaff', 'delete')
  remove(@Param('id') id: string) {
    return this.staff.removeShift(id);
  }
}

@ApiTags('hair-staff')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/time-off')
export class HairLeavesController {
  constructor(private readonly staff: HairStaffService) {}

  @Get()
  @RequirePermission('hairLeaves', 'view')
  @ApiOperation({ summary: 'Leave records overlapping [from, to]; staffId, status' })
  list(@Query() query: HairListQueryDto) {
    return this.staff.listTimeOff(query);
  }

  @Get(':id')
  @RequirePermission('hairLeaves', 'view')
  get(@Param('id') id: string) {
    return this.staff.getTimeOff(id);
  }

  @Post()
  @RequirePermission('hairLeaves', 'create')
  create(@Body() dto: CreateHairTimeOffDto) {
    return this.staff.createTimeOff(dto);
  }

  @Patch(':id')
  @RequirePermission('hairLeaves', 'update')
  @ApiOperation({ summary: 'Approve / reject (status) or edit a leave record' })
  update(@Param('id') id: string, @Body() dto: UpdateHairTimeOffDto) {
    return this.staff.updateTimeOff(id, dto);
  }
}

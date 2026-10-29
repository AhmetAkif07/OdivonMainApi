import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import {
  CreateLeaveDto,
  CreateShiftDto,
  DateRangeQueryDto,
  DecideLeaveDto,
  LeaveBalanceQueryDto,
  LeaveQueryDto,
  UpdateLeaveDto,
  UpdateShiftDto,
} from './staff.dto';
import { StaffService } from './staff.service';

@ApiTags('vet-staff')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/staff')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get('members')
  @ApiOperation({ summary: 'Clinic users that can be scheduled' })
  @RequirePermission('staffSchedule', 'view')
  members() {
    return this.service.members();
  }

  @Get('roster')
  @ApiOperation({ summary: 'Shifts and leaves day by day (max 93 days)' })
  @RequirePermission('staffSchedule', 'view')
  roster(@Query() query: DateRangeQueryDto) {
    return this.service.roster(query);
  }

  @Get('shifts')
  @RequirePermission('staffSchedule', 'view')
  listShifts(@Query() query: DateRangeQueryDto) {
    return this.service.listShifts(query);
  }

  @Post('shifts')
  @RequirePermission('staffSchedule', 'create')
  createShift(@Body() dto: CreateShiftDto) {
    return this.service.createShift(dto);
  }

  @Patch('shifts/:id')
  @RequirePermission('staffSchedule', 'update')
  updateShift(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.service.updateShift(id, dto);
  }

  @Delete('shifts/:id')
  @RequirePermission('staffSchedule', 'delete')
  async removeShift(@Param('id') id: string) {
    await this.service.removeShift(id);
    return { id };
  }

  @Get('leaves')
  @RequirePermission('staffSchedule', 'view')
  listLeaves(@Query() query: LeaveQueryDto) {
    return this.service.listLeaves(query);
  }

  @Get('leaves/balances')
  @ApiOperation({ summary: 'Used and pending leave days per person for a year' })
  @RequirePermission('staffSchedule', 'view')
  balances(@Query() query: LeaveBalanceQueryDto) {
    return this.service.leaveBalances(query.year);
  }

  @Post('leaves')
  @RequirePermission('staffSchedule', 'create')
  createLeave(@Body() dto: CreateLeaveDto) {
    return this.service.createLeave(dto);
  }

  @Patch('leaves/:id')
  @RequirePermission('staffSchedule', 'update')
  updateLeave(@Param('id') id: string, @Body() dto: UpdateLeaveDto) {
    return this.service.updateLeave(id, dto);
  }

  @Post('leaves/:id/decision')
  @ApiOperation({ summary: 'Approve, reject or cancel a leave' })
  @RequirePermission('staffSchedule', 'approve')
  decide(@Param('id') id: string, @Body() dto: DecideLeaveDto) {
    return this.service.decideLeave(id, dto);
  }

  @Delete('leaves/:id')
  @RequirePermission('staffSchedule', 'delete')
  async removeLeave(@Param('id') id: string) {
    await this.service.removeLeave(id);
    return { id };
  }
}

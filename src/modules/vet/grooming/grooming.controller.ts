import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateGroomingAppointmentDto } from './dto/create-grooming-appointment.dto';
import { CreateGroomingStaffDto, UpdateGroomingStaffDto } from './dto/create-grooming-staff.dto';
import { ListGroomingAppointmentsQueryDto } from './dto/list-grooming-appointments.query.dto';
import { UpdateGroomingAppointmentDto } from './dto/update-grooming-appointment.dto';
import { GroomingStatus } from './entities/grooming-appointment.entity';
import { GroomingService } from './grooming.service';

@ApiTags('vet-grooming')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/grooming')
export class GroomingController {
  constructor(private readonly service: GroomingService) {}

  // --- DASHBOARD BOARD ---
  @Get('board')
  @RequirePermission('grooming', 'view')
  @ApiOperation({ summary: 'Get grooming daily operational board summary' })
  getBoard(@Query('date') date?: string) {
    return this.service.getBoardSummary(date);
  }

  // --- COMMISSIONS ---
  @Get('commissions')
  @RequirePermission('grooming', 'view')
  @ApiOperation({ summary: 'Get grooming staff commission report' })
  getCommissions(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('staffId') staffId?: string,
  ) {
    return this.service.getCommissionReport(startDate, endDate, staffId);
  }

  // --- STAFF ---
  @Get('staff')
  @RequirePermission('grooming', 'view')
  @ApiOperation({ summary: 'List grooming staff' })
  listStaff() {
    return this.service.listStaff();
  }

  @Post('staff')
  @RequirePermission('grooming', 'create')
  @ApiOperation({ summary: 'Create grooming staff member' })
  createStaff(@Body() dto: CreateGroomingStaffDto) {
    return this.service.createStaff(dto);
  }

  @Patch('staff/:id')
  @RequirePermission('grooming', 'update')
  @ApiOperation({ summary: 'Update grooming staff member' })
  updateStaff(@Param('id') id: string, @Body() dto: UpdateGroomingStaffDto) {
    return this.service.updateStaff(id, dto);
  }

  @Delete('staff/:id')
  @RequirePermission('grooming', 'delete')
  @ApiOperation({ summary: 'Delete grooming staff member' })
  async deleteStaff(@Param('id') id: string) {
    await this.service.deleteStaff(id);
    return { id };
  }

  // --- APPOINTMENTS ---
  @Get('appointments')
  @RequirePermission('grooming', 'view')
  @ApiOperation({ summary: 'List grooming appointments' })
  listAppointments(@Query() query: ListGroomingAppointmentsQueryDto) {
    return this.service.listAppointments(query);
  }

  @Post('appointments')
  @RequirePermission('grooming', 'create')
  @ApiOperation({ summary: 'Create new grooming appointment' })
  createAppointment(@Body() dto: CreateGroomingAppointmentDto) {
    return this.service.createAppointment(dto);
  }

  @Get('appointments/:id')
  @RequirePermission('grooming', 'view')
  @ApiOperation({ summary: 'Get grooming appointment by id' })
  getAppointment(@Param('id') id: string) {
    return this.service.getAppointmentById(id);
  }

  @Patch('appointments/:id')
  @RequirePermission('grooming', 'update')
  @ApiOperation({ summary: 'Update grooming appointment' })
  updateAppointment(@Param('id') id: string, @Body() dto: UpdateGroomingAppointmentDto) {
    return this.service.updateAppointment(id, dto);
  }

  @Patch('appointments/:id/status')
  @RequirePermission('grooming', 'update')
  @ApiOperation({ summary: 'Update grooming appointment status' })
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: GroomingStatus,
  ) {
    return this.service.updateStatus(id, status);
  }

  @Delete('appointments/:id')
  @RequirePermission('grooming', 'delete')
  @ApiOperation({ summary: 'Delete grooming appointment' })
  async deleteAppointment(@Param('id') id: string) {
    await this.service.deleteAppointment(id);
    return { id };
  }
}
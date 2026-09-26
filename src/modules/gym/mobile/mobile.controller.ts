import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { GymMemberGuard } from './gym-member.guard';
import {
  CancelMobileAppointmentDto,
  CreateWorkoutLogDto,
  PatchMobileMeDto,
} from './mobile.dto';
import { GymMobileService } from './mobile.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, GymMemberGuard] as const;

@ApiTags('gym-mobile')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/mobile')
export class GymMobileController {
  constructor(private readonly mobile: GymMobileService) {}

  @Get('home')
  home() {
    return this.mobile.home();
  }

  @Get('me')
  me() {
    return this.mobile.me();
  }

  @Patch('me')
  updateMe(@Body() dto: PatchMobileMeDto) {
    return this.mobile.updateMe(dto);
  }

  @Get('membership')
  membership() {
    return this.mobile.membership();
  }

  @Post('qr-token')
  qrToken() {
    return this.mobile.createQrToken();
  }

  @Get('check-ins')
  checkIns() {
    return this.mobile.checkIns();
  }

  @Get('workouts')
  workouts() {
    return this.mobile.listWorkouts();
  }

  @Get('workouts/:id')
  workout(@Param('id') id: string) {
    return this.mobile.getWorkout(id);
  }

  @Get('workout-logs')
  workoutLogs() {
    return this.mobile.listWorkoutLogs();
  }

  @Post('workout-logs')
  createWorkoutLog(@Body() dto: CreateWorkoutLogDto) {
    return this.mobile.createWorkoutLog(dto);
  }

  @Get('appointments')
  appointments() {
    return this.mobile.listAppointments();
  }

  @Post('appointments/:id/cancel')
  cancelAppointment(@Param('id') id: string, @Body() dto: CancelMobileAppointmentDto) {
    return this.mobile.cancelAppointment(id, dto);
  }

  @Get('notifications')
  notifications() {
    return this.mobile.listNotifications();
  }

  @Patch('notifications/:id/read')
  readNotification(@Param('id') id: string) {
    return this.mobile.markNotificationRead(id);
  }

  @Get('announcements')
  announcements() {
    return this.mobile.listAnnouncements();
  }
}

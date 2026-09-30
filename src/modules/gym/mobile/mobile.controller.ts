import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantStore } from '../../../shared/tenancy/tenant.context';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { GymReceivablesService } from '../ops/receivables.service';
import { GymMemberGuard } from './gym-member.guard';
import {
  CancelMobileAppointmentDto,
  CreateMealLogDto,
  CreateMeasurementDto,
  CreateMobileAppointmentDto,
  CreateProgressPhotoDto,
  CreateWaterLogDto,
  CompleteWorkoutSessionDto,
  CreateWorkoutLogDto,
  PatchMobileMeDto,
  StartWorkoutSessionDto,
  PaymentIntentDto,
  RenewMembershipDto,
  SendMessageDto,
  WaterQueryDto,
} from './mobile.dto';
import { GymMobileService } from './mobile.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, GymMemberGuard] as const;

@ApiTags('gym-mobile')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/mobile')
export class GymMobileController {
  constructor(
    private readonly mobile: GymMobileService,
    private readonly receivables: GymReceivablesService,
  ) {}

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

  @Post('membership/renew')
  renew(@Body() dto: RenewMembershipDto) {
    return this.mobile.renewMembership(dto);
  }

  @Post('membership/payment-intent')
  paymentIntent(@Body() dto: PaymentIntentDto) {
    return this.mobile.createPaymentIntent(dto);
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

  @Post('workout-sessions')
  startWorkoutSession(@Body() dto: StartWorkoutSessionDto) {
    return this.mobile.startWorkoutSession(dto);
  }

  @Get('workout-sessions')
  workoutSessions() {
    return this.mobile.listWorkoutSessions();
  }

  @Get('workout-sessions/:id')
  workoutSession(@Param('id') id: string) {
    return this.mobile.getWorkoutSession(id);
  }

  @Post('workout-sessions/:id/complete')
  completeWorkoutSession(@Param('id') id: string, @Body() dto: CompleteWorkoutSessionDto) {
    return this.mobile.completeWorkoutSession(id, dto);
  }

  @Get('appointments')
  appointments() {
    return this.mobile.listAppointments();
  }

  @Post('appointments')
  createAppointment(@Body() dto: CreateMobileAppointmentDto) {
    return this.mobile.createAppointment(dto);
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

  @Get('campaigns')
  campaigns() {
    return this.mobile.listCampaigns();
  }

  @Get('measurements')
  measurements() {
    return this.mobile.listMeasurements();
  }

  @Post('measurements')
  createMeasurement(@Body() dto: CreateMeasurementDto) {
    return this.mobile.createMeasurement(dto);
  }

  @Get('progress-photos')
  progressPhotos() {
    return this.mobile.listProgressPhotos();
  }

  @Post('progress-photos')
  createProgressPhoto(@Body() dto: CreateProgressPhotoDto) {
    return this.mobile.createProgressPhoto(dto);
  }

  @Delete('progress-photos/:id')
  deleteProgressPhoto(@Param('id') id: string) {
    return this.mobile.deleteProgressPhoto(id);
  }

  @Get('trainer')
  trainer() {
    return this.mobile.trainer();
  }

  @Get('classes')
  classes() {
    return this.mobile.listClasses();
  }

  @Get('class-bookings')
  classBookings() {
    return this.mobile.listClassBookings();
  }

  @Post('classes/:id/book')
  bookClass(@Param('id') id: string) {
    return this.mobile.bookClass(id);
  }

  @Post('classes/:id/waitlist')
  waitlist(@Param('id') id: string) {
    return this.mobile.joinWaitlist(id);
  }

  @Post('class-bookings/:id/cancel')
  cancelClassBooking(@Param('id') id: string) {
    return this.mobile.cancelClassBooking(id);
  }

  @Get('payments')
  payments() {
    return this.mobile.listPayments();
  }

  @Get('packages')
  packages() {
    return this.mobile.listPackages();
  }

  /** The member's own installment plans; the user id always comes from the token. */
  @Get('debts')
  debts(@CurrentUser() user: TenantStore) {
    return this.receivables.forMember(user.userId);
  }

  @Get('nutrition')
  nutrition() {
    return this.mobile.getNutrition();
  }

  @Post('nutrition/logs')
  logMeal(@Body() dto: CreateMealLogDto) {
    return this.mobile.logMeal(dto);
  }

  @Get('water')
  water(@Query() query: WaterQueryDto) {
    return this.mobile.listWater(query.date);
  }

  @Post('water')
  addWater(@Body() dto: CreateWaterLogDto) {
    return this.mobile.addWater(dto);
  }

  @Get('stats')
  stats() {
    return this.mobile.stats();
  }

  @Get('achievements')
  achievements() {
    return this.mobile.listAchievements();
  }

  @Get('threads')
  threads() {
    return this.mobile.getOrCreateThread();
  }

  @Get('threads/:id/messages')
  messages(@Param('id') id: string) {
    return this.mobile.listMessages(id);
  }

  @Post('threads/:id/messages')
  sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.mobile.sendMessage(id, dto);
  }
}

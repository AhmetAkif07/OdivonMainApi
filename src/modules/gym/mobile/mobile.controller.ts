import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { TenantStore } from '../../../shared/tenancy/tenant.context';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { Request } from 'express';
import { MemberCheckoutDto } from '../../payments/payments.dto';
import { PaymentsService } from '../../payments/payments.service';
import { GymLeadsService } from '../leads/leads.service';
import { GymClassBookingService } from '../ops/class-booking.service';
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
    private readonly classBooking: GymClassBookingService,
    private readonly leads: GymLeadsService,
    private readonly onlinePayments: PaymentsService,
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

  /** Books the next session of the class; uses one class credit when the package has a limit. */
  @Post('classes/:id/book')
  async bookClass(@Param('id') id: string, @CurrentUser() user: TenantStore) {
    const booking = await this.classBooking.book({ scheduleId: id, userId: user.userId });
    return { id: booking.id, status: 'booked', sessionDate: booking.sessionDate };
  }

  @Post('classes/:id/waitlist')
  waitlist(@Param('id') id: string, @CurrentUser() user: TenantStore) {
    return this.classBooking.joinWaitlist({ scheduleId: id, userId: user.userId });
  }

  /** Own bookings only; the credit comes back when cancelled at least 2 hours before the start. */
  @Post('class-bookings/:id/cancel')
  async cancelClassBooking(@Param('id') id: string, @CurrentUser() user: TenantStore) {
    await this.classBooking.cancel(id, { byStaff: false, userId: user.userId });
    return { id };
  }

  /**
   * Card payment (iyzico checkout form, 3D Secure on iyzico's page): package, wallet top-up or the
   * member's own debt. Returns the payment page URL; the result is applied by the callback.
   */
  @Post('payments/checkout')
  checkoutPayment(@Body() dto: MemberCheckoutDto, @Req() request: Request) {
    return this.onlinePayments.createMemberCheckout(dto, request.header('cf-connecting-ip') ?? request.ip ?? '127.0.0.1', request.header('origin'));
  }

  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.onlinePayments.getOwn(id);
  }

  /** Asks iyzico again (result page "check again"); applies a success that the callback missed. */
  @Post('payments/:id/reconcile')
  reconcilePayment(@Param('id') id: string) {
    return this.onlinePayments.reconcileOwn(id);
  }

  /** Referral programme (when the gym runs one) and the member's own referrals with their rewards. */
  @Get('referrals')
  referrals(@CurrentUser() user: TenantStore) {
    return this.leads.memberSummary(user.userId);
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

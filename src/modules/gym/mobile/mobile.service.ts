import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields, omitUndefined } from '../../../shared/firestore/base-document';
import { GymMember } from '../members/member.entity';
import { AccessSyncService } from '../access/access-sync.service';
import { MembersRepository } from '../members/members.repository';
import { GymPackage } from '../packages/package.entity';
import { PackagesRepository } from '../packages/packages.repository';
import { StaffRepository } from '../staff/staff.repository';
import { GymStore } from '../shared/gym-store';
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
} from './mobile.dto';
import { ACHIEVEMENT_DEFS, computeBmi, computeStreak } from './mobile.stats';
import { settleWorkoutSession } from './workout-session.math';

const QR_TTL_MS = 45_000;
type Doc = BaseDocument & Record<string, unknown>;

@Injectable()
export class GymMobileService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly packages: PackagesRepository,
    private readonly staff: StaffRepository,
    private readonly accessSync: AccessSyncService,
  ) {}

  async home() {
    const member = await this.currentMember();
    const userId = member.uid;
    const [workouts, appointments, measurements, logs, announcements] = await Promise.all([
      this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutPlans),
      this.store.list<Doc>(TENANT_COLLECTION.gymPtAppointments),
      this.store.list<Doc>(TENANT_COLLECTION.gymMeasurements),
      this.store.list<Doc>(TENANT_COLLECTION.gymAccessLogs),
      this.listAnnouncements(),
    ]);
    await this.ensureExpiryNotifications(member);

    const myWorkouts = workouts.filter((item) => item['userId'] === userId && item['status'] === 'active');
    const todayWorkout = myWorkouts[0]
      ? {
          planId: myWorkouts[0].id,
          title: String(myWorkouts[0]['title'] ?? 'Antrenman'),
          trainerName: (myWorkouts[0]['trainerName'] as string | null) ?? null,
        }
      : null;

    const now = Date.now();
    const nextAppointment = appointments
      .filter((item) => item['userId'] === userId && item['status'] === 'booked')
      .map((item) => ({
        id: item.id,
        at: String(item['appointmentTime'] ?? ''),
        type: String(item['type'] ?? 'PT'),
        trainerName: String(item['trainerName'] ?? ''),
      }))
      .filter((item) => {
        const time = new Date(item.at).getTime();
        return !Number.isNaN(time) && time >= now;
      })
      .sort((left, right) => left.at.localeCompare(right.at))[0] ?? null;

    const lastMeasurementDoc = measurements
      .filter((item) => item['userId'] === userId)
      .sort((left, right) => String(right['date'] ?? right.createdAt).localeCompare(String(left['date'] ?? left.createdAt)))[0];

    const lastMeasurement = lastMeasurementDoc
      ? {
          weightKg: numberOrNull(lastMeasurementDoc['weight']),
          at: String(lastMeasurementDoc['date'] ?? lastMeasurementDoc.createdAt),
        }
      : null;

    const visitsThisMonth = countVisitsThisMonth(logs, userId);
    const monthlyProgress = await this.monthlyProgressFor(userId, visitsThisMonth, measurements);

    return {
      member: {
        uid: member.uid,
        firstName: firstName(member.displayName),
        displayName: member.displayName,
        photoURL: member.photoURL,
      },
      membership: this.membershipSummary(member),
      todayWorkout,
      nextAppointment,
      lastMeasurement,
      visitsThisMonth,
      monthlyProgress,
      announcements: announcements.slice(0, 5),
    };
  }

  async me() {
    const member = await this.currentMember();
    return {
      uid: member.uid,
      email: member.email,
      displayName: member.displayName,
      photoURL: member.photoURL,
      phone: member.phone,
      gender: member.gender,
      birthDate: member.birthDate,
      language: member.language,
      branchName: member.branchName,
      trainerId: member.trainerId,
      trainerName: member.trainerName,
      emergencyContactName: member.emergencyContactName,
      emergencyContactPhone: member.emergencyContactPhone,
      emergencyContactRelation: member.emergencyContactRelation,
      memberNumber: member.memberNumber,
      walletBalance: member.walletBalance ?? 0,
      autoRenew: Boolean((member as GymMember & { autoRenew?: boolean }).autoRenew),
      membership: this.membershipSummary(member),
    };
  }

  async updateMe(dto: PatchMobileMeDto) {
    const member = await this.currentMember();
    await this.members.save({
      ...member,
      photoURL: dto.photoURL !== undefined ? dto.photoURL : member.photoURL,
      phone: dto.phone !== undefined ? dto.phone : member.phone,
      emergencyContactName:
        dto.emergencyContactName !== undefined ? dto.emergencyContactName : member.emergencyContactName,
      emergencyContactPhone:
        dto.emergencyContactPhone !== undefined ? dto.emergencyContactPhone : member.emergencyContactPhone,
      emergencyContactRelation:
        dto.emergencyContactRelation !== undefined
          ? dto.emergencyContactRelation
          : member.emergencyContactRelation,
      language: dto.language !== undefined ? dto.language : member.language,
      autoRenew: dto.autoRenew !== undefined ? dto.autoRenew : (member as GymMember & { autoRenew?: boolean }).autoRenew,
    });
    return this.me();
  }

  async membership() {
    const member = await this.currentMember();
    const pkg = await this.findPackage(member);
    const logs = await this.store.list<Doc>(TENANT_COLLECTION.gymAccessLogs);
    const visits = countVisitsSince(logs, member.uid, member.membershipStartsAt);
    const freezeUsed = countFreezeNotes(member.notes);
    const sessionCount = pkg?.sessionCount ?? null;
    const unlimited = pkg?.isUnlimitedSessions ?? false;
    return {
      ...this.membershipSummary(member),
      packageName: member.packageLabel,
      packagePrice: member.packagePrice,
      startsAt: member.membershipStartsAt,
      endsAt: member.membershipEndsAt,
      features: pkg?.features ?? [],
      maxFreeze: pkg?.maxFreeze ?? 0,
      freezeUsed,
      freezeRemaining: Math.max(0, (pkg?.maxFreeze ?? 0) - freezeUsed),
      sessionCount,
      isUnlimitedSessions: unlimited,
      sessionsUsed: visits,
      sessionsRemaining: unlimited || sessionCount == null ? null : Math.max(0, sessionCount - visits),
      checkInStartTime: pkg?.checkInStartTime ?? null,
      checkInEndTime: pkg?.checkInEndTime ?? null,
      allowedDays: pkg?.allowedDays ?? null,
      ptPackage: null,
      groupClassCredits: null,
      trainerName: member.trainerName,
    };
  }

  async createQrToken() {
    const member = await this.currentMember();
    const token = randomBytes(24).toString('base64url');
    const now = Date.now();
    const expiresAt = new Date(now + QR_TTL_MS).toISOString();
    const ref = this.store.collection(TENANT_COLLECTION.gymQrTokens).doc(token);
    const item = {
      ...createBaseFields(token, member.uid),
      tenantId: this.store.tenantId(),
      token,
      userId: member.uid,
      expiresAt,
      usedAt: null as string | null,
    };
    await ref.set(item);
    return {
      token,
      expiresAt,
      expiresInSeconds: Math.round(QR_TTL_MS / 1000),
      qrPayload: JSON.stringify({
        app: 'odivon_pass',
        ver: 2,
        token,
        exp: now + QR_TTL_MS,
      }),
    };
  }

  async checkIns() {
    const member = await this.currentMember();
    const logs = (await this.store.list<Doc>(TENANT_COLLECTION.gymAccessLogs))
      .filter((item) => item['userId'] === member.uid)
      .sort((left, right) =>
        String(right['timestamp'] ?? right.createdAt).localeCompare(String(left['timestamp'] ?? left.createdAt)),
      );
    const granted = logs.filter((item) => item['status'] === 'granted');
    const lastIn = granted.find((item) => item['direction'] === 'in') ?? null;
    const lastOut = granted.find((item) => item['direction'] === 'out') ?? null;
    const openCheckIn = Boolean(
      lastIn &&
        (!lastOut ||
          String(lastIn['timestamp'] ?? lastIn.createdAt) > String(lastOut['timestamp'] ?? lastOut.createdAt)),
    );
    return {
      items: logs.slice(0, 50).map(toCheckInItem),
      visitsThisMonth: countVisitsThisMonth(logs, member.uid),
      lastCheckIn: lastIn ? toCheckInItem(lastIn) : null,
      lastCheckOut: lastOut ? toCheckInItem(lastOut) : null,
      openCheckIn,
    };
  }

  async listWorkouts() {
    const userId = this.store.userId();
    const items = await this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutPlans);
    return items
      .filter((item) => item['userId'] === userId)
      .map(toWorkoutSummary);
  }

  async getWorkout(id: string) {
    const plan = await this.ownWorkout(id);
    const logs = await this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutLogs);
    const mine = logs.filter((item) => item['userId'] === this.store.userId());
    const exercises = Array.isArray(plan['exercises']) ? (plan['exercises'] as Record<string, unknown>[]) : [];
    return {
      ...toWorkoutSummary(plan),
      description: (plan['description'] as string | null) ?? null,
      notes: (plan['notes'] as string | null) ?? null,
      exercises: exercises.map((exercise) => {
        const name = String(exercise['name'] ?? '');
        return {
          id: (exercise['id'] as string | undefined) ?? null,
          name,
          muscleGroup: (exercise['muscleGroup'] as string | undefined) ?? null,
          equipmentName: (exercise['equipmentName'] as string | undefined) ?? null,
          dayName: (exercise['dayName'] as string | undefined) ?? null,
          sets: numberOrNull(exercise['sets']),
          reps: exercise['reps'] ?? null,
          weight: numberOrNull(exercise['weight']),
          restSeconds: numberOrNull(exercise['restSeconds']),
          notes: (exercise['notes'] as string | undefined) ?? null,
          previous: previousSet(mine, name),
        };
      }),
    };
  }

  async listWorkoutLogs() {
    const userId = this.store.userId();
    const logs = (await this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutLogs)).filter(
      (item) => item['userId'] === userId,
    );
    return logs.map((item) => ({
      ...toWorkoutLog(item),
      previous: previousSet(
        logs.filter((other) => other.id !== item.id),
        String(item['exerciseName'] ?? ''),
        String(item['performedAt'] ?? item.createdAt),
      ),
    }));
  }

  async createWorkoutLog(dto: CreateWorkoutLogDto) {
    const plan = await this.ownWorkout(dto.planId);
    const userId = this.store.userId();
    const performedAt = dto.performedAt || new Date().toISOString();
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymWorkoutLogs, {
      userId,
      planId: plan.id,
      planTitle: plan['title'] ?? null,
      exerciseId: dto.exerciseId ?? null,
      exerciseName: dto.exerciseName.trim(),
      performedAt,
      sets: dto.sets.map((set) => ({
        setIndex: set.setIndex,
        kg: set.kg,
        reps: set.reps,
        completed: set.completed ?? true,
      })),
    });
    const logs = (await this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutLogs)).filter(
      (item) => item['userId'] === userId && item.id !== created.id,
    );
    await this.unlockAchievements();
    return {
      ...toWorkoutLog(created),
      previous: previousSet(logs, dto.exerciseName.trim(), performedAt),
    };
  }

  async startWorkoutSession(dto: StartWorkoutSessionDto) {
    const plan = await this.ownWorkout(dto.planId);
    const userId = this.store.userId();
    const ref = this.store.collection(TENANT_COLLECTION.gymWorkoutSessions).doc(dto.sessionId);
    const existing = await ref.get();
    const current = existing.exists ? (existing.data() as Doc) : null;
    if (current && !current.deletedAt) {
      return toWorkoutSession(current, null);
    }
    const item = {
      ...createBaseFields(dto.sessionId, userId),
      tenantId: this.store.tenantId(),
      userId,
      planId: plan.id,
      planTitle: (plan['title'] as string | null) ?? null,
      startedAt: dto.startedAt,
      status: 'active',
      settled: false,
    };
    await ref.set(item);
    return toWorkoutSession(item as Doc, null);
  }

  async listWorkoutSessions() {
    const userId = this.store.userId();
    const items = (await this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutSessions))
      .filter((item) => item['userId'] === userId)
      .sort((left, right) =>
        String(right['completedAt'] ?? right['startedAt'] ?? right.createdAt).localeCompare(
          String(left['completedAt'] ?? left['startedAt'] ?? left.createdAt),
        ),
      );
    return items.map((item) => toWorkoutSession(item, null));
  }

  async getWorkoutSession(id: string) {
    const item = await this.ownSession(id);
    return toWorkoutSession(item, null);
  }

  async completeWorkoutSession(id: string, dto: CompleteWorkoutSessionDto) {
    const current = await this.ownSession(id);
    if (current['status'] === 'completed' && current['settled'] === true) {
      const stats = await this.buildStats();
      return toWorkoutSession(current, stats.streak);
    }
    const userId = this.store.userId();
    const [logs, measurements, sessions] = await Promise.all([
      this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutLogs),
      this.store.list<Doc>(TENANT_COLLECTION.gymMeasurements),
      this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutSessions),
    ]);
    const priorBestKg: Record<string, number> = {};
    for (const log of logs.filter((item) => item['userId'] === userId)) {
      const name = String(log['exerciseName'] ?? '');
      const at = new Date(String(log['performedAt'] ?? log.createdAt)).getTime();
      if (Number.isNaN(at) || at >= new Date(dto.startedAt).getTime()) continue;
      const sets = Array.isArray(log['sets']) ? (log['sets'] as Record<string, unknown>[]) : [];
      for (const set of sets) {
        if (set['completed'] === false) continue;
        const kg = numberOrNull(set['kg']);
        if (kg == null) continue;
        if (priorBestKg[name] == null || kg > priorBestKg[name]) priorBestKg[name] = kg;
      }
    }
    const mine = measurements
      .filter((item) => item['userId'] === userId)
      .sort((left, right) => String(right['date'] ?? right.createdAt).localeCompare(String(left['date'] ?? left.createdAt)));
    const settled = settleWorkoutSession({
      startedAt: dto.startedAt,
      completedAt: dto.completedAt,
      pausedDurationMs: dto.pausedDurationMs,
      restDurationMs: dto.restDurationMs,
      sets: dto.sets.map((set) => ({
        exerciseName: set.exerciseName,
        weight: set.weight,
        reps: set.reps,
        status: set.status,
      })),
      priorBestKg,
      measurementKg: numberOrNull(mine[0]?.['weight']),
    });
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymWorkoutSessions,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Session not found',
      {
        status: 'completed',
        settled: true,
        startedAt: dto.startedAt,
        completedAt: dto.completedAt,
        pausedDurationMs: dto.pausedDurationMs,
        restDurationMs: dto.restDurationMs,
        // Plain copies: Firestore rejects the DTO class instances the validation pipe creates.
        sets: dto.sets.map((set) => omitUndefined({ ...set })),
        volumeKg: settled.volumeKg,
        prCount: settled.prCount,
        activeDurationMs: settled.activeDurationMs,
        calories: settled.calories,
        weekVolumeDeltaPercent: weekVolumeDelta(sessions, userId, String(current['planId'] ?? ''), settled.volumeKg, dto.completedAt),
      },
    );
    await this.unlockAchievements();
    const stats = await this.buildStats();
    return toWorkoutSession(updated, stats.streak);
  }

  async listAppointments() {
    const userId = this.store.userId();
    const items = await this.store.list<Doc>(TENANT_COLLECTION.gymPtAppointments);
    return items
      .filter((item) => item['userId'] === userId)
      .map(toAppointment)
      .sort((left, right) => right.at.localeCompare(left.at));
  }

  async cancelAppointment(id: string, dto: CancelMobileAppointmentDto) {
    const item = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymPtAppointments,
      id,
      ErrorCode.GYM_PT_NOT_FOUND,
      'Appointment not found',
    );
    if (item['userId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_PT_NOT_FOUND, 'Appointment not found');
    }
    if (item['status'] === 'cancelled') {
      return toAppointment(item);
    }
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymPtAppointments,
      id,
      ErrorCode.GYM_PT_NOT_FOUND,
      'Appointment not found',
      {
        status: 'cancelled',
        cancellationReason: dto.cancellationReason ?? '',
      },
    );
    return toAppointment(updated);
  }

  async createAppointment(dto: CreateMobileAppointmentDto) {
    const member = await this.currentMember();
    const start = new Date(dto.appointmentTime).getTime();
    if (Number.isNaN(start)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Invalid appointment time');
    }
    const duration = dto.duration ?? 60;
    const end = start + duration * 60_000;
    const existing = await this.store.list<Doc>(TENANT_COLLECTION.gymPtAppointments);
    const trainerId = member.trainerId;
    const conflict = existing.some((item) => {
      if (item['trainerId'] !== trainerId) return false;
      if (item['status'] === 'cancelled') return false;
      const otherStart = new Date(String(item['appointmentTime'])).getTime();
      const otherEnd = otherStart + Number(item['duration'] ?? 60) * 60_000;
      return start < otherEnd && end > otherStart;
    });
    if (conflict) {
      throw new AppException(ErrorCode.GYM_PT_CONFLICT, 'Trainer is not available at this time');
    }
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymPtAppointments, {
      userId: member.uid,
      trainerId,
      trainerName: member.trainerName,
      appointmentTime: new Date(start).toISOString(),
      duration,
      type: dto.type ?? 'PT',
      status: 'booked',
      notes: dto.notes ?? '',
    });
    return toAppointment(created);
  }

  async listNotifications() {
    const member = await this.currentMember();
    await this.ensureExpiryNotifications(member);
    const items = await this.store.list<Doc>(TENANT_COLLECTION.gymMemberNotifications);
    return items
      .filter((item) => item['userId'] === member.uid)
      .map(toNotification);
  }

  async markNotificationRead(id: string) {
    const item = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymMemberNotifications,
      id,
      ErrorCode.GYM_NOTIFICATION_NOT_FOUND,
      'Notification not found',
    );
    if (item['userId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_NOTIFICATION_NOT_FOUND, 'Notification not found');
    }
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymMemberNotifications,
      id,
      ErrorCode.GYM_NOTIFICATION_NOT_FOUND,
      'Notification not found',
      { readAt: item['readAt'] || new Date().toISOString() },
    );
    return toNotification(updated);
  }

  async listAnnouncements() {
    const items = await this.store.list<Doc>(TENANT_COLLECTION.gymCampaigns);
    return items
      .filter((item) => {
        if (item['status'] !== 'active') {
          return false;
        }
        const channels = Array.isArray(item['channels']) ? (item['channels'] as string[]) : [];
        return channels.includes('in_app');
      })
      .map((item) => ({
        id: item.id,
        title: String(item['title'] ?? item['name'] ?? 'Duyuru'),
        body: String(
          (item['messageTemplate'] as { inAppBody?: string } | undefined)?.inAppBody ??
            item['description'] ??
            '',
        ),
        validFrom: (item['validFrom'] as string | undefined) ?? null,
        validUntil: (item['validUntil'] as string | undefined) ?? null,
      }));
  }

  async listMeasurements() {
    const userId = this.store.userId();
    return (await this.store.list<Doc>(TENANT_COLLECTION.gymMeasurements))
      .filter((item) => item['userId'] === userId)
      .map(toMeasurement)
      .sort((left, right) => right.date.localeCompare(left.date));
  }

  async createMeasurement(dto: CreateMeasurementDto) {
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymMeasurements, {
      userId: this.store.userId(),
      date: dto.date || new Date().toISOString(),
      weight: dto.weight ?? null,
      height: dto.height ?? null,
      chest: dto.chest ?? null,
      waist: dto.waist ?? null,
      hips: dto.hips ?? null,
      bicep: dto.bicep ?? null,
      thigh: dto.thigh ?? null,
      calf: dto.calf ?? null,
      bodyFatPercentage: dto.bodyFatPercentage ?? null,
      muscleMassKg: dto.muscleMassKg ?? null,
      notes: dto.notes ?? null,
      bmi: computeBmi(dto.weight ?? null, dto.height ?? null),
    });
    return toMeasurement(created);
  }

  async listProgressPhotos() {
    const userId = this.store.userId();
    return (await this.store.list<Doc>(TENANT_COLLECTION.gymBodyPhotos))
      .filter((item) => item['userId'] === userId)
      .map(toPhoto)
      .sort((left, right) => right.takenAt.localeCompare(left.takenAt));
  }

  async createProgressPhoto(dto: CreateProgressPhotoDto) {
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymBodyPhotos, {
      userId: this.store.userId(),
      pose: dto.pose,
      storagePath: dto.storagePath,
      contentType: dto.contentType ?? 'image/jpeg',
      takenAt: dto.takenAt || new Date().toISOString(),
    });
    return toPhoto(created);
  }

  async deleteProgressPhoto(id: string) {
    const item = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymBodyPhotos,
      id,
      ErrorCode.GYM_PHOTO_NOT_FOUND,
      'Photo not found',
    );
    if (item['userId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_PHOTO_NOT_FOUND, 'Photo not found');
    }
    return this.store.softDelete(TENANT_COLLECTION.gymBodyPhotos, id, ErrorCode.GYM_PHOTO_NOT_FOUND, 'Photo not found');
  }

  async trainer() {
    const member = await this.currentMember();
    if (!member.trainerId) {
      return null;
    }
    try {
      const staff = await this.staff.getByIdOrThrow(member.trainerId);
      return {
        id: staff.id,
        displayName: staff.displayName,
        title: staff.title,
        specialties: staff.specialties ?? [],
        photoURL: staff.avatarUrl,
        branchName: staff.branchName,
      };
    } catch {
      return {
        id: member.trainerId,
        displayName: member.trainerName ?? 'Antrenör',
        title: 'Antrenör',
        specialties: [] as string[],
        photoURL: null as string | null,
        branchName: member.branchName,
      };
    }
  }

  async listClasses() {
    const userId = this.store.userId();
    const [schedules, bookings, waitlist] = await Promise.all([
      this.store.list<Doc>(TENANT_COLLECTION.gymClassSchedules),
      this.store.list<Doc>(TENANT_COLLECTION.gymClassBookings),
      this.store.list<Doc>(TENANT_COLLECTION.gymClassWaitlist),
    ]);
    const myBookingByClass = new Map(
      bookings
        .filter((item) => item['userId'] === userId && item['attendanceStatus'] !== 'cancelled')
        .map((item) => [String(item['classScheduleId']), item.id]),
    );
    const myWait = new Set(
      waitlist.filter((item) => item['userId'] === userId).map((item) => String(item['classScheduleId'])),
    );
    return schedules
      .filter((item) => item['status'] === 'active')
      .map((item) => ({
        id: item.id,
        name: String(item['name'] ?? 'Ders'),
        instructorName: String(item['instructorName'] ?? ''),
        dayOfWeek: Number(item['dayOfWeek'] ?? 1),
        startTime: String(item['startTime'] ?? ''),
        endTime: String(item['endTime'] ?? ''),
        capacity: Number(item['capacity'] ?? 0),
        taken: Number(item['currentBookings'] ?? 0),
        booked: myBookingByClass.has(item.id),
        bookingId: myBookingByClass.get(item.id) ?? null,
        waitlisted: myWait.has(item.id),
      }));
  }

  async listClassBookings() {
    const userId = this.store.userId();
    return (await this.store.list<Doc>(TENANT_COLLECTION.gymClassBookings))
      .filter((item) => item['userId'] === userId)
      .map((item) => ({
        id: item.id,
        classScheduleId: String(item['classScheduleId'] ?? ''),
        className: String(item['className'] ?? ''),
        status: String(item['attendanceStatus'] ?? 'booked'),
        bookingDate: String(item['bookingDate'] ?? item.createdAt),
      }));
  }

  async bookClass(scheduleId: string) {
    const schedule = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymClassSchedules,
      scheduleId,
      ErrorCode.GYM_CLASS_NOT_FOUND,
      'Class not found',
    );
    const userId = this.store.userId();
    const bookings = await this.store.list<Doc>(TENANT_COLLECTION.gymClassBookings);
    const already = bookings.find(
      (item) =>
        item['userId'] === userId &&
        item['classScheduleId'] === scheduleId &&
        item['attendanceStatus'] !== 'cancelled',
    );
    if (already) {
      return { id: already.id, status: 'booked' };
    }
    const capacity = Number(schedule['capacity'] ?? 0);
    const taken = Number(schedule['currentBookings'] ?? 0);
    if (capacity && taken >= capacity) {
      throw new AppException(ErrorCode.GYM_CLASS_FULL, 'Class is full');
    }
    const enrolled = Array.isArray(schedule['enrolledMemberIds'])
      ? [...(schedule['enrolledMemberIds'] as string[])]
      : [];
    if (!enrolled.includes(userId)) {
      enrolled.push(userId);
    }
    const booking = await this.store.create(TENANT_COLLECTION.gymClassBookings, {
      userId,
      classScheduleId: scheduleId,
      className: schedule['name'] ?? '',
      attendanceStatus: 'booked',
      bookingDate: new Date().toISOString(),
    });
    await this.store.save(TENANT_COLLECTION.gymClassSchedules, {
      ...schedule,
      currentBookings: taken + 1,
      enrolledMemberIds: enrolled,
    } as Doc);
    return { id: booking.id, status: 'booked' };
  }

  async joinWaitlist(scheduleId: string) {
    await this.store.getOrThrow(
      TENANT_COLLECTION.gymClassSchedules,
      scheduleId,
      ErrorCode.GYM_CLASS_NOT_FOUND,
      'Class not found',
    );
    const userId = this.store.userId();
    const existing = (await this.store.list<Doc>(TENANT_COLLECTION.gymClassWaitlist)).find(
      (item) => item['userId'] === userId && item['classScheduleId'] === scheduleId,
    );
    if (existing) {
      throw new AppException(ErrorCode.GYM_WAITLIST_EXISTS, 'Already on waitlist');
    }
    const created = await this.store.create(TENANT_COLLECTION.gymClassWaitlist, {
      userId,
      classScheduleId: scheduleId,
    });
    return { id: created.id, status: 'waitlisted' };
  }

  async cancelClassBooking(bookingId: string) {
    const booking = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymClassBookings,
      bookingId,
      ErrorCode.GYM_BOOKING_NOT_FOUND,
      'Booking not found',
    );
    if (booking['userId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_BOOKING_NOT_FOUND, 'Booking not found');
    }
    await this.store.update(
      TENANT_COLLECTION.gymClassBookings,
      bookingId,
      ErrorCode.GYM_BOOKING_NOT_FOUND,
      'Booking not found',
      { attendanceStatus: 'cancelled' },
    );
    const scheduleId = String(booking['classScheduleId'] ?? '');
    if (scheduleId) {
      const schedule = await this.store.getOrThrow<Doc>(
        TENANT_COLLECTION.gymClassSchedules,
        scheduleId,
        ErrorCode.GYM_CLASS_NOT_FOUND,
        'Class not found',
      );
      const enrolled = (
        Array.isArray(schedule['enrolledMemberIds']) ? schedule['enrolledMemberIds'] : []
      ) as string[];
      await this.store.save(TENANT_COLLECTION.gymClassSchedules, {
        ...schedule,
        currentBookings: Math.max(0, Number(schedule['currentBookings'] ?? 1) - 1),
        enrolledMemberIds: enrolled.filter((id) => id !== booking['userId']),
      } as Doc);
      await this.promoteWaitlist(scheduleId);
    }
    return { id: bookingId };
  }

  async listPayments() {
    const userId = this.store.userId();
    const [wallet, sales, accounting] = await Promise.all([
      this.store.list<Doc>(TENANT_COLLECTION.gymWalletTx),
      this.store.list<Doc>(TENANT_COLLECTION.gymShopSales),
      this.store.list<Doc>(TENANT_COLLECTION.gymAccountingEntries),
    ]);
    const items = [
      ...wallet
        .filter((item) => item['userId'] === userId)
        .map((item) => ({
          id: item.id,
          source: 'wallet',
          title: String(item['description'] ?? 'Cüzdan'),
          amount: Number(item['amount'] ?? 0),
          type: String(item['type'] ?? 'deposit'),
          at: item.createdAt,
        })),
      ...sales
        .filter((item) => item['userId'] === userId)
        .map((item) => ({
          id: item.id,
          source: 'shop',
          title: String(item['productName'] ?? item['description'] ?? 'Satış'),
          amount: Number(item['totalAmount'] ?? item['amount'] ?? 0),
          type: 'debit',
          at: String(item['saleDate'] ?? item.createdAt),
        })),
      ...accounting
        .filter((item) => item['userId'] === userId)
        .map((item) => ({
          id: item.id,
          source: 'membership',
          title: String(item['description'] ?? item['category'] ?? 'Üyelik'),
          amount: Number(item['amount'] ?? 0),
          type: String(item['type'] ?? 'income'),
          at: item.createdAt,
        })),
    ].sort((left, right) => right.at.localeCompare(left.at));
    const member = await this.currentMember();
    return { walletBalance: member.walletBalance ?? 0, items };
  }

  async listPackages() {
    const items = await this.packages.list({});
    return items
      .filter((item) => item.status === 'active' && !item.isHidden)
      .map((item) => ({
        id: item.id,
        name: item.name,
        price: item.price,
        durationDays: item.durationDays,
        features: item.features ?? [],
        description: item.description,
      }));
  }

  async listCampaigns() {
    return this.listAnnouncements();
  }

  async getNutrition() {
    const userId = this.store.userId();
    const plans = (await this.store.list<Doc>(TENANT_COLLECTION.gymNutritionPlans))
      .filter((item) => item['userId'] === userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const plan = plans[0] ?? null;
    if (!plan) {
      return { plan: null, logs: [] as ReturnType<typeof toMealLog>[], totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 } };
    }
    const today = new Date().toISOString().slice(0, 10);
    const logs = (await this.store.list<Doc>(TENANT_COLLECTION.gymMealLogs)).filter(
      (item) => item['userId'] === userId && String(item['date'] ?? '').startsWith(today),
    );
    const meals = Array.isArray(plan['meals']) ? (plan['meals'] as Record<string, unknown>[]) : [];
    const taken = new Set(logs.map((item) => Number(item['mealIndex'])));
    const totals = meals.reduce(
      (acc: { kcal: number; protein: number; carbs: number; fat: number }, meal, index) => {
        if (!taken.has(index)) {
          return acc;
        }
        acc.kcal += Number(meal['kcal'] ?? 0);
        acc.protein += Number(meal['protein'] ?? 0);
        acc.carbs += Number(meal['carbs'] ?? 0);
        acc.fat += Number(meal['fat'] ?? 0);
        return acc;
      },
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    return {
      plan: {
        id: plan.id,
        title: String(plan['title'] ?? 'Beslenme programı'),
        targets: {
          kcal: Number(plan['kcal'] ?? 0),
          protein: Number(plan['protein'] ?? 0),
          carbs: Number(plan['carbs'] ?? 0),
          fat: Number(plan['fat'] ?? 0),
          waterMl: Number(plan['waterMl'] ?? 2500),
        },
        meals: meals.map((meal, index) => ({
          index,
          name: String(meal['name'] ?? `Öğün ${index + 1}`),
          time: String(meal['time'] ?? ''),
          items: Array.isArray(meal['items']) ? meal['items'] : [],
          kcal: Number(meal['kcal'] ?? 0),
          protein: Number(meal['protein'] ?? 0),
          carbs: Number(meal['carbs'] ?? 0),
          fat: Number(meal['fat'] ?? 0),
          taken: taken.has(index),
        })),
      },
      logs: logs.map(toMealLog),
      totals,
    };
  }

  async logMeal(dto: CreateMealLogDto) {
    const nutrition = await this.getNutrition();
    if (!nutrition.plan) {
      throw new AppException(ErrorCode.GYM_NUTRITION_NOT_FOUND, 'Nutrition plan not found');
    }
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymMealLogs, {
      userId: this.store.userId(),
      planId: dto.planId ?? nutrition.plan.id,
      mealIndex: dto.mealIndex,
      date: (dto.date || new Date().toISOString()).slice(0, 10),
    });
    return toMealLog(created);
  }

  async listWater(date?: string) {
    const userId = this.store.userId();
    const day = (date || new Date().toISOString()).slice(0, 10);
    const items = (await this.store.list<Doc>(TENANT_COLLECTION.gymWaterLogs)).filter((item) => {
      if (item['userId'] !== userId) {
        return false;
      }
      return String(item['date'] ?? item.createdAt).startsWith(day);
    });
    const totalMl = items.reduce((sum, item) => sum + Number(item['amount'] ?? item['amountMl'] ?? 0), 0);
    const member = await this.currentMember();
    const targetMl = Number((member as GymMember & { waterTargetMl?: number }).waterTargetMl ?? 2500);
    return {
      date: day,
      totalMl,
      targetMl,
      items: items.map((item) => ({
        id: item.id,
        amountMl: Number(item['amount'] ?? item['amountMl'] ?? 0),
        at: String(item['date'] ?? item.createdAt),
      })),
    };
  }

  async addWater(dto: CreateWaterLogDto) {
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymWaterLogs, {
      userId: this.store.userId(),
      amount: dto.amountMl,
      amountMl: dto.amountMl,
      unit: 'ml',
      date: dto.date || new Date().toISOString(),
    });
    return this.listWater(String(created['date'] ?? created.createdAt).slice(0, 10));
  }

  async stats() {
    return this.buildStats();
  }

  async listAchievements() {
    await this.unlockAchievements();
    const userId = this.store.userId();
    const unlocked = (await this.store.list<Doc>(TENANT_COLLECTION.gymMemberAchievements)).filter(
      (item) => item['userId'] === userId,
    );
    const byId = new Map(unlocked.map((item) => [String(item['achievementId']), item]));
    return ACHIEVEMENT_DEFS.map((def) => ({
      id: def.id,
      title: def.title,
      description: def.description,
      unlocked: byId.has(def.id),
      unlockedAt: byId.get(def.id)?.createdAt ?? null,
    }));
  }

  async getOrCreateThread() {
    const member = await this.currentMember();
    const threads = await this.store.list<Doc>(TENANT_COLLECTION.gymThreads);
    const existing = threads.find(
      (item) => item['memberId'] === member.uid && item['trainerId'] === (member.trainerId ?? ''),
    );
    if (existing) {
      return toThread(existing);
    }
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymThreads, {
      memberId: member.uid,
      trainerId: member.trainerId,
      trainerName: member.trainerName,
      lastMessageAt: null,
    });
    return toThread(created);
  }

  async listMessages(threadId: string) {
    const thread = await this.ownThread(threadId);
    return (await this.store.list<Doc>(TENANT_COLLECTION.gymMessages))
      .filter((item) => item['threadId'] === thread.id)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(toMessage);
  }

  async sendMessage(threadId: string, dto: SendMessageDto) {
    const thread = await this.ownThread(threadId);
    const body = dto.body.trim();
    if (!body) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Message cannot be empty');
    }
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymMessages, {
      threadId: thread.id,
      senderId: this.store.userId(),
      body,
    });
    await this.store.update(
      TENANT_COLLECTION.gymThreads,
      thread.id,
      ErrorCode.GYM_THREAD_NOT_FOUND,
      'Thread not found',
      { lastMessageAt: created.createdAt },
    );
    await this.store.create(TENANT_COLLECTION.gymMemberNotifications, {
      userId: this.store.userId(),
      type: 'new_message',
      title: 'Mesaj gönderildi',
      body: body.slice(0, 120),
      readAt: new Date().toISOString(),
    });
    return toMessage(created);
  }

  async renewMembership(dto: RenewMembershipDto) {
    const member = await this.currentMember();
    const pkg = (await this.packages.list({})).find((item) => item.id === dto.packageId);
    if (!pkg) {
      throw new AppException(ErrorCode.GYM_PACKAGE_NOT_FOUND, 'Package not found');
    }
    const amount = Number(pkg.price ?? 0);
    const current = Number(member.walletBalance ?? 0);
    if (current < amount) {
      throw new AppException(ErrorCode.GYM_WALLET_INSUFFICIENT, 'Insufficient wallet balance');
    }
    const now = new Date();
    let base = now;
    if (member.membershipStatus === 'active' && member.membershipEndsAt) {
      const currentEnd = new Date(member.membershipEndsAt);
      if (currentEnd.getTime() > now.getTime()) {
        base = currentEnd;
      }
    }
    const ends = new Date(base.getTime());
    ends.setDate(ends.getDate() + Number(pkg.durationDays ?? 30));
    const renewed = await this.members.save({
      ...member,
      walletBalance: current - amount,
      membershipStatus: 'active',
      packageLabel: pkg.name,
      packagePrice: amount,
      membershipStartsAt: now.toISOString(),
      membershipEndsAt: ends.toISOString(),
    });
    await this.accessSync.syncMemberSafely(renewed);
    await this.store.create(TENANT_COLLECTION.gymWalletTx, {
      userId: member.uid,
      type: 'debit',
      amount,
      description: `${pkg.name} yenileme`,
      referenceType: 'package',
      status: 'completed',
      paymentMethod: 'wallet',
    });
    await this.store.create(TENANT_COLLECTION.gymAccountingEntries, {
      type: 'income',
      amount,
      category: 'membership',
      userId: member.uid,
      description: `${pkg.name} yenileme`,
    });
    return this.membership();
  }

  createPaymentIntent(dto: PaymentIntentDto) {
    return {
      status: 'not_implemented',
      provider: dto.provider ?? null,
      packageId: dto.packageId,
      message: 'Kartlı ödeme henüz bağlanmadı. Cüzdanla yenileme kullanılabilir.',
    };
  }

  private currentMember() {
    return this.members.getByIdOrThrow(this.store.userId());
  }

  private async ownSession(id: string) {
    const item = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymWorkoutSessions,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Session not found',
    );
    if (item['userId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Session not found');
    }
    return item;
  }

  private async ownWorkout(id: string) {
    const plan = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymWorkoutPlans,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Workout not found',
    );
    if (plan['userId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found');
    }
    return plan;
  }

  private membershipSummary(member: GymMember) {
    const daysLeft = daysRemaining(member.membershipEndsAt);
    return {
      status: member.membershipStatus,
      type: member.packageLabel,
      daysLeft,
      endsAt: member.membershipEndsAt,
      startsAt: member.membershipStartsAt,
    };
  }

  private async findPackage(member: GymMember): Promise<GymPackage | null> {
    if (!member.packageLabel) {
      return null;
    }
    const packages = await this.packages.list({});
    return packages.find((item) => item.name === member.packageLabel) ?? null;
  }

  private async ensureExpiryNotifications(member: GymMember) {
    const daysLeft = daysRemaining(member.membershipEndsAt);
    if (daysLeft == null || ![1, 3, 7].includes(daysLeft)) {
      return;
    }
    const type = `membership_expiry_${daysLeft}`;
    const existing = await this.store.list<Doc>(TENANT_COLLECTION.gymMemberNotifications);
    if (existing.some((item) => item['userId'] === member.uid && item['type'] === type)) {
      return;
    }
    await this.store.create(TENANT_COLLECTION.gymMemberNotifications, {
      userId: member.uid,
      type,
      title: 'Üyeliğin bitiyor',
      body: `Üyeliğinin bitmesine ${daysLeft} gün kaldı.`,
      readAt: null,
    });
  }

  private async ownThread(id: string) {
    const thread = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymThreads,
      id,
      ErrorCode.GYM_THREAD_NOT_FOUND,
      'Thread not found',
    );
    if (thread['memberId'] !== this.store.userId()) {
      throw new AppException(ErrorCode.GYM_THREAD_NOT_FOUND, 'Thread not found');
    }
    return thread;
  }

  private async promoteWaitlist(scheduleId: string) {
    const waiting = (await this.store.list<Doc>(TENANT_COLLECTION.gymClassWaitlist))
      .filter((item) => item['classScheduleId'] === scheduleId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
    const next = waiting[0];
    if (!next) {
      return;
    }
    const userId = String(next['userId']);
    await this.store.softDelete(
      TENANT_COLLECTION.gymClassWaitlist,
      next.id,
      ErrorCode.GYM_CLASS_NOT_FOUND,
      'Waitlist not found',
    );
    const schedule = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymClassSchedules,
      scheduleId,
      ErrorCode.GYM_CLASS_NOT_FOUND,
      'Class not found',
    );
    const enrolled = Array.isArray(schedule['enrolledMemberIds'])
      ? [...(schedule['enrolledMemberIds'] as string[])]
      : [];
    if (!enrolled.includes(userId)) {
      enrolled.push(userId);
    }
    await this.store.create(TENANT_COLLECTION.gymClassBookings, {
      userId,
      classScheduleId: scheduleId,
      className: schedule['name'] ?? '',
      attendanceStatus: 'booked',
      bookingDate: new Date().toISOString(),
    });
    await this.store.save(TENANT_COLLECTION.gymClassSchedules, {
      ...schedule,
      currentBookings: Number(schedule['currentBookings'] ?? 0) + 1,
      enrolledMemberIds: enrolled,
    } as Doc);
    await this.store.create(TENANT_COLLECTION.gymMemberNotifications, {
      userId,
      type: 'class_promoted',
      title: 'Bekleme listesinden yer açıldı',
      body: `${String(schedule['name'] ?? 'Ders')} kaydın onaylandı.`,
      readAt: null,
    });
  }

  private monthlyProgressFor(userId: string, visitsThisMonth: number, measurements: Doc[]) {
    return this.buildStats(userId, visitsThisMonth, measurements);
  }

  private async buildStats(userId = this.store.userId(), visitsThisMonth?: number, measurements?: Doc[]) {
    const [access, measureDocs, sessions] = await Promise.all([
      this.store.list<Doc>(TENANT_COLLECTION.gymAccessLogs),
      measurements ? Promise.resolve(measurements) : this.store.list<Doc>(TENANT_COLLECTION.gymMeasurements),
      this.store.list<Doc>(TENANT_COLLECTION.gymWorkoutSessions),
    ]);
    const month = monthPrefix();
    const myWorkouts = sessions.filter(
      (item) =>
        item['userId'] === userId &&
        item['status'] === 'completed' &&
        String(item['completedAt'] ?? '').startsWith(month),
    );
    const myAccess = access.filter((item) => isGrantedIn(item, userId));
    const visitsMonth = visitsThisMonth ?? countVisitsThisMonth(access, userId);
    const dates = [
      ...sessions
        .filter((item) => item['userId'] === userId && item['status'] === 'completed')
        .map((item) => String(item['completedAt'] ?? item.createdAt)),
      ...myAccess.map((item) => String(item['timestamp'] ?? item.createdAt)),
    ];
    const mine = measureDocs.filter((item) => item['userId'] === userId);
    const sorted = [...mine].sort((left, right) =>
      String(right['date'] ?? right.createdAt).localeCompare(String(left['date'] ?? left.createdAt)),
    );
    const latest = sorted[0];
    const previous = sorted[1];
    const weightDelta =
      latest && previous ? Number(latest['weight'] ?? 0) - Number(previous['weight'] ?? 0) : 0;
    const workouts = myWorkouts.length;
    const streak = computeStreak(dates);
    const goalPercent = Math.min(100, Math.round((Math.max(workouts, visitsMonth) / 20) * 100));
    return {
      workouts,
      visits: visitsMonth,
      visitsTotal: myAccess.length,
      streak,
      weightDelta: Math.round(weightDelta * 10) / 10,
      goalPercent,
    };
  }

  private async unlockAchievements() {
    const stats = await this.buildStats();
    const userId = this.store.userId();
    const existing = (await this.store.list<Doc>(TENANT_COLLECTION.gymMemberAchievements)).filter(
      (item) => item['userId'] === userId,
    );
    const have = new Set(existing.map((item) => String(item['achievementId'])));
    const values: Record<string, number> = {
      workouts: stats.workouts,
      streak: stats.streak,
      visitsMonth: stats.visits,
      visitsTotal: stats.visitsTotal,
    };
    for (const def of ACHIEVEMENT_DEFS) {
      if (have.has(def.id)) {
        continue;
      }
      if ((values[def.metric] ?? 0) >= def.threshold) {
        await this.store.create(TENANT_COLLECTION.gymMemberAchievements, {
          userId,
          achievementId: def.id,
        });
      }
    }
  }
}

export function daysRemaining(endsAt: string | null): number | null {
  if (!endsAt) {
    return null;
  }
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(end)) {
    return null;
  }
  return Math.max(0, Math.ceil((end - Date.now()) / 86_400_000));
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function countFreezeNotes(notes: string | null): number {
  if (!notes) {
    return 0;
  }
  return (notes.match(/\[Donduruldu\]/g) ?? []).length;
}

function isGrantedIn(item: Doc, userId: string): boolean {
  return item['userId'] === userId && item['status'] === 'granted' && item['direction'] !== 'out';
}

function countVisitsThisMonth(logs: Doc[], userId: string): number {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return logs.filter((item) => {
    if (!isGrantedIn(item, userId)) {
      return false;
    }
    return String(item['timestamp'] ?? item.createdAt).startsWith(month);
  }).length;
}

function countVisitsSince(logs: Doc[], userId: string, since: string | null): number {
  const start = since ? new Date(since).getTime() : 0;
  return logs.filter((item) => {
    if (!isGrantedIn(item, userId)) {
      return false;
    }
    const time = new Date(String(item['timestamp'] ?? item.createdAt)).getTime();
    return !Number.isNaN(time) && time >= start;
  }).length;
}

function previousSet(logs: Doc[], exerciseName: string, before?: string) {
  const cutoff = before ? new Date(before).getTime() : Number.POSITIVE_INFINITY;
  const mine = logs
    .filter((item) => String(item['exerciseName'] ?? '') === exerciseName)
    .filter((item) => {
      const time = new Date(String(item['performedAt'] ?? item.createdAt)).getTime();
      return !Number.isNaN(time) && time < cutoff;
    });
  let maxKg: number | null = null;
  let reps: number | null = null;
  let at: string | null = null;
  for (const item of mine) {
    const sets = Array.isArray(item['sets']) ? (item['sets'] as Record<string, unknown>[]) : [];
    for (const set of sets) {
      if (set['completed'] === false) {
        continue;
      }
      const kg = numberOrNull(set['kg']);
      if (kg == null) {
        continue;
      }
      if (maxKg == null || kg > maxKg) {
        maxKg = kg;
        reps = numberOrNull(set['reps']);
        at = String(item['performedAt'] ?? item.createdAt);
      }
    }
  }
  if (maxKg == null) {
    return null;
  }
  return { kg: maxKg, reps, at };
}

function toWorkoutSummary(item: Doc) {
  return {
    id: item.id,
    title: String(item['title'] ?? 'Program'),
    status: String(item['status'] ?? 'active'),
    trainerName: (item['trainerName'] as string | null) ?? null,
    startDate: (item['startDate'] as string | undefined) ?? item.createdAt,
    endDate: (item['endDate'] as string | null | undefined) ?? null,
    exerciseCount: Array.isArray(item['exercises']) ? item['exercises'].length : 0,
  };
}

function toWorkoutSession(item: Doc, streak: number | null) {
  const calories = item['calories'];
  return {
    id: item.id,
    planId: String(item['planId'] ?? ''),
    title: (item['planTitle'] as string | null) ?? null,
    status: String(item['status'] ?? 'active'),
    startedAt: (item['startedAt'] as string | null) ?? item.createdAt,
    completedAt: (item['completedAt'] as string | null) ?? null,
    pausedDurationMs: numberOrNull(item['pausedDurationMs']) ?? 0,
    restDurationMs: numberOrNull(item['restDurationMs']) ?? 0,
    activeDurationMs: numberOrNull(item['activeDurationMs']),
    volumeKg: numberOrNull(item['volumeKg']),
    prCount: numberOrNull(item['prCount']),
    calories: calories && typeof calories === 'object' ? calories : null,
    sets: Array.isArray(item['sets']) ? item['sets'] : [],
    streak,
    weekVolumeDeltaPercent: numberOrNull(item['weekVolumeDeltaPercent']),
  };
}

function weekVolumeDelta(sessions: Doc[], userId: string, planId: string, volumeKg: number, completedAt: string): number | null {
  const end = new Date(completedAt).getTime();
  const start = end - 7 * 86_400_000;
  const previous = sessions
    .filter((item) => item['userId'] === userId && item['planId'] === planId && item['status'] === 'completed')
    .map((item) => ({ at: new Date(String(item['completedAt'] ?? '')).getTime(), volume: numberOrNull(item['volumeKg']) }))
    .filter((item) => !Number.isNaN(item.at) && item.at >= start && item.at < end && item.volume != null)
    .sort((left, right) => right.at - left.at)[0];
  if (!previous || previous.volume == null || previous.volume <= 0) return null;
  return Math.round(((volumeKg - previous.volume) / previous.volume) * 1000) / 10;
}

function toWorkoutLog(item: Doc) {
  return {
    id: item.id,
    planId: String(item['planId'] ?? ''),
    planTitle: (item['planTitle'] as string | null) ?? null,
    exerciseId: (item['exerciseId'] as string | null) ?? null,
    exerciseName: String(item['exerciseName'] ?? ''),
    performedAt: String(item['performedAt'] ?? item.createdAt),
    sets: Array.isArray(item['sets']) ? item['sets'] : [],
  };
}

function toAppointment(item: Doc) {
  return {
    id: item.id,
    at: String(item['appointmentTime'] ?? item.createdAt),
    duration: numberOrNull(item['duration']) ?? 60,
    type: String(item['type'] ?? 'PT'),
    trainerName: String(item['trainerName'] ?? ''),
    status: String(item['status'] ?? 'booked'),
    notes: (item['notes'] as string | null) ?? null,
    cancellationReason: (item['cancellationReason'] as string | null) ?? null,
  };
}

function toNotification(item: Doc) {
  return {
    id: item.id,
    type: String(item['type'] ?? 'info'),
    title: String(item['title'] ?? ''),
    body: String(item['body'] ?? ''),
    readAt: (item['readAt'] as string | null) ?? null,
    createdAt: item.createdAt,
  };
}

function toCheckInItem(item: Doc) {
  return {
    id: item.id,
    direction: String(item['direction'] ?? 'in'),
    status: String(item['status'] ?? ''),
    gateName: String(item['gateName'] ?? 'Turnike'),
    method: String(item['method'] ?? 'qr'),
    timestamp: String(item['timestamp'] ?? item.createdAt),
    notes: (item['notes'] as string | null) ?? null,
  };
}

function monthPrefix(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function toMeasurement(item: Doc) {
  const weight = numberOrNull(item['weight']);
  const height = numberOrNull(item['height']);
  return {
    id: item.id,
    date: String(item['date'] ?? item.createdAt),
    weight,
    height,
    chest: numberOrNull(item['chest']),
    waist: numberOrNull(item['waist']),
    hips: numberOrNull(item['hips']),
    bicep: numberOrNull(item['bicep']),
    thigh: numberOrNull(item['thigh']),
    calf: numberOrNull(item['calf']),
    bodyFatPercentage: numberOrNull(item['bodyFatPercentage']),
    muscleMassKg: numberOrNull(item['muscleMassKg']),
    bmi: numberOrNull(item['bmi']) ?? computeBmi(weight, height),
    notes: (item['notes'] as string | null) ?? null,
  };
}

function toPhoto(item: Doc) {
  return {
    id: item.id,
    pose: String(item['pose'] ?? 'front'),
    storagePath: String(item['storagePath'] ?? ''),
    contentType: String(item['contentType'] ?? 'image/jpeg'),
    takenAt: String(item['takenAt'] ?? item.createdAt),
  };
}

function toThread(item: Doc) {
  return {
    id: item.id,
    memberId: String(item['memberId'] ?? ''),
    trainerId: (item['trainerId'] as string | null) ?? null,
    trainerName: (item['trainerName'] as string | null) ?? null,
    lastMessageAt: (item['lastMessageAt'] as string | null) ?? null,
  };
}

function toMessage(item: Doc) {
  return {
    id: item.id,
    threadId: String(item['threadId'] ?? ''),
    senderId: String(item['senderId'] ?? ''),
    body: String(item['body'] ?? ''),
    createdAt: item.createdAt,
  };
}

function toMealLog(item: Doc) {
  return {
    id: item.id,
    planId: String(item['planId'] ?? ''),
    mealIndex: Number(item['mealIndex'] ?? 0),
    date: String(item['date'] ?? item.createdAt).slice(0, 10),
  };
}

export { computeBmi, computeStreak };

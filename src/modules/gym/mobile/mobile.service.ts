import { randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields } from '../../../shared/firestore/base-document';
import { GymMember } from '../members/member.entity';
import { MembersRepository } from '../members/members.repository';
import { GymPackage } from '../packages/package.entity';
import { PackagesRepository } from '../packages/packages.repository';
import { GymStore } from '../shared/gym-store';
import {
  CancelMobileAppointmentDto,
  CreateWorkoutLogDto,
  PatchMobileMeDto,
} from './mobile.dto';

const QR_TTL_MS = 45_000;
type Doc = BaseDocument & Record<string, unknown>;

@Injectable()
export class GymMobileService {
  constructor(
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly packages: PackagesRepository,
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
      visitsThisMonth: countVisitsThisMonth(logs, userId),
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
    return {
      ...toWorkoutLog(created),
      previous: previousSet(logs, dto.exerciseName.trim(), performedAt),
    };
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

  private currentMember() {
    return this.members.getByIdOrThrow(this.store.userId());
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
  const match = logs
    .filter((item) => String(item['exerciseName'] ?? '') === exerciseName)
    .filter((item) => {
      const time = new Date(String(item['performedAt'] ?? item.createdAt)).getTime();
      return !Number.isNaN(time) && time < cutoff;
    })
    .sort((left, right) =>
      String(right['performedAt'] ?? right.createdAt).localeCompare(String(left['performedAt'] ?? left.createdAt)),
    )[0];
  if (!match) {
    return null;
  }
  const sets = Array.isArray(match['sets']) ? (match['sets'] as Record<string, unknown>[]) : [];
  const last = [...sets].reverse().find((set) => set['completed'] !== false) ?? sets.at(-1);
  if (!last) {
    return null;
  }
  return {
    kg: numberOrNull(last['kg']),
    reps: numberOrNull(last['reps']),
    at: String(match['performedAt'] ?? match.createdAt),
  };
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

function toWorkoutLog(item: Doc) {
  return {
    id: item.id,
    planId: String(item['planId'] ?? ''),
    planTitle: (item['planTitle'] as string | null) ?? null,
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

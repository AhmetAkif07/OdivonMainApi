import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { isLeadStage, LeadRecord, stageChange } from '../leads/leads.rules';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { GymStore } from '../shared/gym-store';
import { normalizePlanContent, planContent } from '../shared/workout-plan.normalize';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';
import { isOpenRequest, MemberRequestType, nextRequestStatus, requestStatus, requestType, visibleToTrainer } from '../shared/member-requests';
import { planPeriodPatch } from '../shared/plan-progress';
import { isTrainerOnly, trainerIdentity } from '../shared/trainer-scope';
import { GymPushService } from '../signals/push.service';
import { ProgramRequestQueryDto, ResolveProgramRequestDto, toProgramRequest } from './program-request.dto';

type Doc = BaseDocument & Record<string, unknown>;

/** A trainer saving a plan several times in a row sends the member one notification. */
const PLAN_UPDATE_NOTICE_GAP_MS = 10 * 60_000;
/** Plan fields whose change the member should hear about (a status change alone is not one). */
const NOTIFY_ON = ['title', 'days', 'exercises', 'durationWeeks', 'targetDaysPerWeek', 'notes'] as const;
const REPLY_TITLE: Record<MemberRequestType, string> = {
  program: 'Program talebin',
  program_change: 'Program değişikliği talebin',
  floor_help: 'Antrenör çağrın',
  measurement: 'Ölçüm talebin',
};

/** Plans and templates always answer with both `days` and the legacy `exercises`. */
function withPlanContent(item: Doc): Doc {
  return { ...item, ...planContent(item) };
}

function withPlanPage(page: PaginatedResult<Doc>) {
  return new PaginatedResult(page.items.map(withPlanContent), page.limit, page.nextCursor);
}

/** What the member reads when the trainer answers without writing anything. */
function replyText(type: MemberRequestType, status: string, trainer: string): string {
  if (status === 'accepted') {
    if (type === 'floor_help') return `${trainer} geliyor.`;
    if (type === 'measurement') return `${trainer} ölçüm için seninle görüşecek.`;
    if (type === 'program_change') return `${trainer} değişiklik talebini inceliyor.`;
    return `${trainer} programını hazırlıyor.`;
  }
  if (status === 'fulfilled') return type === 'program' ? 'Yeni programın hazır.' : 'Talebin tamamlandı.';
  return `${trainer} talebini şimdilik karşılayamadı.`;
}

@Injectable()
export class GymSportService {
  constructor(
    private readonly store: GymStore,
    private readonly tenant: TenantContext,
    private readonly push: GymPushService,
  ) {}

  listClasses(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymClassSchedules, query);
  }

  createClass(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymClassSchedules, {
      ...dto,
      currentBookings: 0,
      enrolledMemberIds: dto.enrolledMemberIds ?? [],
      status: dto.status ?? 'active',
    });
  }

  getClass(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.gymClassSchedules, id, ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found');
  }

  updateClass(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymClassSchedules, id, ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found', dto);
  }

  removeClass(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymClassSchedules, id, ErrorCode.GYM_CLASS_NOT_FOUND, 'Class not found');
  }

  listBookings(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymClassBookings, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      if (query.scheduleId && item['classScheduleId'] !== query.scheduleId) return false;
      return item['attendanceStatus'] !== 'cancelled';
    });
  }

  async assignMembers(scheduleId: string, dto: GymRecordDto) {
    const schedule = (await this.getClass(scheduleId)) as Doc;
    const ids = dto.enrolledMemberIds ?? [];
    await this.store.save(TENANT_COLLECTION.gymClassSchedules, {
      ...schedule,
      enrolledMemberIds: ids,
      currentBookings: ids.length,
    } as Doc);
    return this.getClass(scheduleId);
  }

  listAppointments(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymPtAppointments, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      if (query.trainerId && item['trainerId'] !== query.trainerId) return false;
      return true;
    });
  }

  async createAppointment(dto: GymRecordDto) {
    const userId = dto.userId || this.store.userId();
    const start = new Date(dto.appointmentTime || Date.now()).getTime();
    const duration = dto.duration ?? 60;
    const end = start + duration * 60_000;
    const existing = await this.store.list<Doc>(TENANT_COLLECTION.gymPtAppointments);
    const conflict = existing.some((item) => {
      if (item['trainerId'] !== dto.trainerId) return false;
      if (item['status'] === 'cancelled') return false;
      const otherStart = new Date(String(item['appointmentTime'])).getTime();
      const otherEnd = otherStart + Number(item['duration'] ?? 60) * 60_000;
      return start < otherEnd && end > otherStart;
    });
    if (conflict) {
      throw new AppException(ErrorCode.GYM_PT_CONFLICT, 'Trainer already has an appointment in this slot');
    }
    return this.store.create(TENANT_COLLECTION.gymPtAppointments, {
      ...dto,
      userId,
      status: dto.status ?? 'booked',
      appointmentTime: dto.appointmentTime || new Date().toISOString(),
      duration,
    });
  }

  updateAppointment(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymPtAppointments, id, ErrorCode.GYM_PT_NOT_FOUND, 'Appointment not found', dto);
  }

  completeAppointment(id: string) {
    return this.store.update(TENANT_COLLECTION.gymPtAppointments, id, ErrorCode.GYM_PT_NOT_FOUND, 'Appointment not found', {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
  }

  cancelAppointment(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymPtAppointments, id, ErrorCode.GYM_PT_NOT_FOUND, 'Appointment not found', {
      status: 'cancelled',
      cancellationReason: dto.cancellationReason ?? dto.notes ?? '',
    });
  }

  removeAppointment(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymPtAppointments, id, ErrorCode.GYM_PT_NOT_FOUND, 'Appointment not found');
  }

  async listWorkouts(query: GymListQueryDto) {
    const page = await this.store.page<Doc>(TENANT_COLLECTION.gymWorkoutPlans, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      return true;
    });
    return withPlanPage(page);
  }

  async createWorkout(dto: GymRecordDto) {
    const userId = dto.userId || this.store.userId();
    const startDate = dto.startDate || new Date().toISOString();
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymWorkoutPlans, {
      ...dto,
      userId,
      ...normalizePlanContent({ days: dto.days, exercises: dto.exercises ?? [] }),
      ...planPeriodPatch({ ...dto, startDate }),
      status: dto.status ?? 'active',
      startDate,
      progressStats: { completedSessions: 0, lastSessionAt: null, lastDayId: null },
    });
    const title = String(dto.title ?? 'Yeni program');
    await this.push.notifyMember(this.store.tenantId(), userId, {
      type: 'new_program',
      title: 'Yeni antrenman programı',
      body: dto.durationWeeks ? `${title} atandı · ${dto.durationWeeks} hafta.` : `${title} atandı.`,
      data: { planId: created.id },
    });
    await this.fulfillPendingProgramRequests(userId, created.id);
    return withPlanContent(created);
  }

  /**
   * Requests to the trainers. Without `type` only program requests (what older panel builds
   * expect); `type=all` every kind. A trainer sees their own members', unassigned ones and floor calls.
   */
  async listProgramRequests(query: ProgramRequestQueryDto = {}) {
    const scope = await this.trainerScope();
    const wanted = query.type ?? 'program';
    const items = await this.store.list<Doc>(TENANT_COLLECTION.gymProgramRequests);
    return items
      .filter((item) => wanted === 'all' || requestType(item) === wanted)
      .filter((item) => !scope || visibleToTrainer(item, scope))
      .map((item) => toProgramRequest(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  /**
   * A trainer answers a request: `accepted` ("on my way" / "I'll prepare it"), `fulfilled` or
   * `rejected`, with an optional reply the member reads in the app.
   */
  async resolveProgramRequest(id: string, dto: ResolveProgramRequestDto) {
    const current = await this.ownProgramRequest(id);
    const type = requestType(current);
    const action = dto.status === 'accepted' ? 'accept' : dto.status === 'fulfilled' ? 'fulfill' : 'reject';
    const status = nextRequestStatus(requestStatus(current), action);
    if (!status) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu talep zaten sonuçlanmış.');
    }
    if (status === 'fulfilled' && type === 'program' && !dto.planId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Program gerekli.');
    }
    const ctx = this.tenant.getStore();
    const me = await trainerIdentity(this.store, ctx);
    const nowIso = new Date().toISOString();
    const reply = (dto.reply ?? dto.notes)?.trim();
    const patch: Record<string, unknown> =
      status === 'accepted'
        ? { status, acceptedAt: nowIso, acceptedBy: ctx.userId, acceptedByName: me.name }
        : { status, planId: dto.planId ?? current['planId'] ?? null, resolvedAt: nowIso, resolvedBy: ctx.userId, resolvedByName: me.name };
    if (reply) patch['reply'] = reply;
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymProgramRequests,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Program request not found',
      patch,
    );
    await this.push.notifyMember(this.store.tenantId(), String(current['userId']), {
      type: `request_${status}`,
      title: REPLY_TITLE[type],
      body: reply || replyText(type, status, me.name),
      data: { requestId: id, requestType: type, ...(dto.planId ? { planId: dto.planId } : {}) },
      urgent: type === 'floor_help' && status === 'accepted',
    });
    return toProgramRequest(updated);
  }

  /** A new plan for the member answers their open program (and program change) requests. */
  private async fulfillPendingProgramRequests(userId: string, planId: string) {
    const items = await this.store.listBy<Doc>(TENANT_COLLECTION.gymProgramRequests, 'userId', userId);
    const open = items.filter((item) => {
      const type = requestType(item);
      return (type === 'program' || type === 'program_change') && isOpenRequest(item);
    });
    await this.resolveRequests(open, { status: 'fulfilled', planId });
  }

  /** Measurement requests close when a trainer enters a measurement for that member. */
  private async fulfillPendingMeasurementRequests(userId: string) {
    const items = await this.store.listBy<Doc>(TENANT_COLLECTION.gymProgramRequests, 'userId', userId);
    const open = items.filter((item) => requestType(item) === 'measurement' && isOpenRequest(item));
    if (!open.length) return;
    await this.resolveRequests(open, { status: 'fulfilled' });
    await this.push.notifyMember(this.store.tenantId(), userId, {
      type: 'request_fulfilled',
      title: REPLY_TITLE.measurement,
      body: 'Ölçümün kaydedildi. Sonuçları Ölçümler ekranında görebilirsin.',
      data: { screen: 'measurements', requestType: 'measurement' },
    });
  }

  private async resolveRequests(items: Doc[], patch: Record<string, unknown>) {
    const ctx = this.tenant.getStore();
    const resolvedAt = new Date().toISOString();
    await Promise.all(
      items.map((item) =>
        this.store.update(TENANT_COLLECTION.gymProgramRequests, item.id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Program request not found', {
          ...patch,
          resolvedAt,
          resolvedBy: ctx.userId,
        }),
      ),
    );
  }

  /** The trainer ids a trainer-only account is limited to; null for everyone else (they see all). */
  private async trainerScope(): Promise<string[] | null> {
    const ctx = this.tenant.getStore();
    if (!isTrainerOnly(ctx)) return null;
    return (await trainerIdentity(this.store, ctx)).ids;
  }

  private async ownProgramRequest(id: string) {
    const current = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymProgramRequests,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Program request not found',
    );
    const scope = await this.trainerScope();
    if (scope && !visibleToTrainer(current, scope)) {
      throw new AppException(ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Program request not found');
    }
    return current;
  }

  /**
   * Edits a plan. The period (`durationWeeks`) moves `endDate` with it; the member hears about
   * a content change at most once per few minutes, never about a status change alone.
   */
  async updateWorkout(id: string, dto: GymRecordDto) {
    const current = await this.store.getOrThrow<Doc>(
      TENANT_COLLECTION.gymWorkoutPlans,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Workout not found',
    );
    const now = Date.now();
    const lastNotice = new Date(String(current['updateNotifiedAt'] ?? '')).getTime();
    const notify =
      current['createdByMember'] !== true &&
      NOTIFY_ON.some((field) => dto[field] !== undefined) &&
      (Number.isNaN(lastNotice) || now - lastNotice >= PLAN_UPDATE_NOTICE_GAP_MS);
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymWorkoutPlans,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Workout not found',
      {
        ...dto,
        ...normalizePlanContent(dto),
        ...planPeriodPatch(dto, current, now),
        ...(notify ? { updateNotifiedAt: new Date(now).toISOString() } : {}),
      },
    );
    if (notify && current['userId']) {
      await this.push.notifyMember(this.store.tenantId(), String(current['userId']), {
        type: 'program_updated',
        title: 'Programın güncellendi',
        body: `Antrenörün "${String(updated['title'] ?? 'Program')}" programında değişiklik yaptı.`,
        data: { planId: id },
      });
    }
    return withPlanContent(updated);
  }

  removeWorkout(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymWorkoutPlans, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found');
  }

  async listTemplates(query: GymListQueryDto) {
    return withPlanPage(await this.store.page<Doc>(TENANT_COLLECTION.gymWorkoutTemplates, query));
  }

  async createTemplate(dto: GymRecordDto) {
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymWorkoutTemplates, {
      ...dto,
      ...normalizePlanContent({ days: dto.days, exercises: dto.exercises ?? [] }),
      isSystemDefault: false,
    });
    return withPlanContent(created);
  }

  async updateTemplate(id: string, dto: GymRecordDto) {
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymWorkoutTemplates,
      id,
      ErrorCode.GYM_TEMPLATE_NOT_FOUND,
      'Template not found',
      { ...dto, ...normalizePlanContent(dto) },
    );
    return withPlanContent(updated);
  }

  removeTemplate(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymWorkoutTemplates,
      id,
      ErrorCode.GYM_TEMPLATE_NOT_FOUND,
      'Template not found',
    );
  }

  listMeasurements(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymMeasurements, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      return true;
    });
  }

  async createMeasurement(dto: GymRecordDto) {
    const userId = dto.userId || this.store.userId();
    const created = await this.store.create(TENANT_COLLECTION.gymMeasurements, {
      ...dto,
      userId,
      date: dto.date || new Date().toISOString(),
    });
    if (userId !== this.store.userId()) {
      await this.fulfillPendingMeasurementRequests(userId).catch(() => undefined);
    }
    return created;
  }

  updateMeasurement(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymMeasurements,
      id,
      ErrorCode.GYM_MEASUREMENT_NOT_FOUND,
      'Measurement not found',
      dto,
    );
  }

  removeMeasurement(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymMeasurements,
      id,
      ErrorCode.GYM_MEASUREMENT_NOT_FOUND,
      'Measurement not found',
    );
  }

  listWater(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymWaterLogs, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      return true;
    });
  }

  createWater(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymWaterLogs, {
      ...dto,
      userId: dto.userId || this.store.userId(),
      date: dto.date || new Date().toISOString(),
      amount: dto.amount ?? 0,
      unit: dto.unit ?? 'ml',
    });
  }

  updateWater(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymWaterLogs, id, ErrorCode.GYM_WATER_NOT_FOUND, 'Water log not found', dto);
  }

  removeWater(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymWaterLogs, id, ErrorCode.GYM_WATER_NOT_FOUND, 'Water log not found');
  }

  listGuests(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymGuestMembers, query);
  }

  createGuest(dto: GymRecordDto) {
    const status = isLeadStage(dto.status) ? dto.status : 'visited';
    return this.store.create(TENANT_COLLECTION.gymGuestMembers, {
      ...dto,
      status,
      source: dto.source ?? (dto.referrerMemberId ? 'referral' : null),
      stageHistory: [{ stage: status, at: new Date().toISOString(), by: this.store.userId() }],
    });
  }

  /** A status change is also written to the lead's stage history (for the funnel report). */
  async updateGuest(id: string, dto: GymRecordDto) {
    const current = await this.store.getOrThrow<Doc & LeadRecord>(TENANT_COLLECTION.gymGuestMembers, id, ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found');
    const stage = isLeadStage(dto.status) && dto.status !== current.status ? stageChange(current, dto.status, this.store.userId()) : {};
    return this.store.update(TENANT_COLLECTION.gymGuestMembers, id, ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found', {
      ...dto,
      ...stage,
      ...(dto.lostReason !== undefined ? { lostReason: dto.lostReason } : {}),
    });
  }

  removeGuest(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymGuestMembers, id, ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found');
  }

  listDisciplines(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymDisciplines, query);
  }

  createDiscipline(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymDisciplines, {
      ...dto,
      requiredDocuments: dto.requiredDocuments ?? [],
      supportedSessionTypes: dto.supportedSessionTypes ?? ['free'],
      status: dto.status ?? 'active',
    });
  }

  updateDiscipline(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymDisciplines,
      id,
      ErrorCode.GYM_DISCIPLINE_NOT_FOUND,
      'Discipline not found',
      dto,
    );
  }

  removeDiscipline(id: string) {
    return this.store.softDelete(
      TENANT_COLLECTION.gymDisciplines,
      id,
      ErrorCode.GYM_DISCIPLINE_NOT_FOUND,
      'Discipline not found',
    );
  }

  listFacilities(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymFacilities, query);
  }

  createFacility(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymFacilities, {
      ...dto,
      disciplineIds: dto.disciplineIds ?? [],
      status: dto.status ?? 'active',
    });
  }

  updateFacility(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymFacilities, id, ErrorCode.GYM_FACILITY_NOT_FOUND, 'Facility not found', dto);
  }

  removeFacility(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymFacilities, id, ErrorCode.GYM_FACILITY_NOT_FOUND, 'Facility not found');
  }

  listEquipment(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymEquipment, query);
  }

  createEquipment(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymEquipment, {
      ...dto,
      targetMuscleGroups: dto.targetMuscleGroups ?? [],
      quantity: dto.quantity ?? 1,
      condition: dto.condition ?? 'good',
    });
  }

  updateEquipment(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymEquipment, id, ErrorCode.GYM_EQUIPMENT_NOT_FOUND, 'Equipment not found', dto);
  }

  removeEquipment(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymEquipment, id, ErrorCode.GYM_EQUIPMENT_NOT_FOUND, 'Equipment not found');
  }
}

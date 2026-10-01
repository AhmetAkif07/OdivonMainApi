import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { GymStore } from '../shared/gym-store';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';

type Doc = BaseDocument & Record<string, unknown>;

@Injectable()
export class GymSportService {
  constructor(private readonly store: GymStore) {}

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

  listWorkouts(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymWorkoutPlans, query, (item) => {
      if (query.userId && item['userId'] !== query.userId) return false;
      return true;
    });
  }

  async createWorkout(dto: GymRecordDto) {
    const userId = dto.userId || this.store.userId();
    const created = await this.store.create(TENANT_COLLECTION.gymWorkoutPlans, {
      ...dto,
      userId,
      exercises: dto.exercises ?? [],
      status: dto.status ?? 'active',
      startDate: dto.startDate || new Date().toISOString(),
    });
    await this.store.create(TENANT_COLLECTION.gymMemberNotifications, {
      userId,
      type: 'new_program',
      title: 'Yeni antrenman programı',
      body: `${String(dto.title ?? 'Yeni program')} atandı.`,
      readAt: null,
    });
    return created;
  }

  updateWorkout(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymWorkoutPlans, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found', dto);
  }

  removeWorkout(id: string) {
    return this.store.softDelete(TENANT_COLLECTION.gymWorkoutPlans, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found');
  }

  listTemplates(query: GymListQueryDto) {
    return this.store.page<Doc>(TENANT_COLLECTION.gymWorkoutTemplates, query);
  }

  createTemplate(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymWorkoutTemplates, {
      ...dto,
      exercises: dto.exercises ?? [],
      isSystemDefault: false,
    });
  }

  updateTemplate(id: string, dto: GymRecordDto) {
    return this.store.update(
      TENANT_COLLECTION.gymWorkoutTemplates,
      id,
      ErrorCode.GYM_TEMPLATE_NOT_FOUND,
      'Template not found',
      dto,
    );
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

  createMeasurement(dto: GymRecordDto) {
    return this.store.create(TENANT_COLLECTION.gymMeasurements, {
      ...dto,
      userId: dto.userId || this.store.userId(),
      date: dto.date || new Date().toISOString(),
    });
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
    return this.store.create(TENANT_COLLECTION.gymGuestMembers, {
      ...dto,
      status: dto.status ?? 'visited',
    });
  }

  updateGuest(id: string, dto: GymRecordDto) {
    return this.store.update(TENANT_COLLECTION.gymGuestMembers, id, ErrorCode.GYM_GUEST_NOT_FOUND, 'Guest not found', dto);
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

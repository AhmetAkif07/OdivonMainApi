import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument } from '../../../shared/firestore/base-document';
import { GymStore } from '../shared/gym-store';
import { normalizePlanContent, planContent } from '../shared/workout-plan.normalize';
import {
  CreateMeasurementDto,
  MemberWorkoutPlanDto,
  UpdateMobileAppointmentDto,
  UpdateWaterLogDto,
} from './mobile.dto';
import { computeBmi } from './mobile.stats';
import { toAppointment, toMeasurement } from './mobile.service';

type Doc = BaseDocument & Record<string, unknown>;

const HISTORY_LIMIT = 100;

/**
 * The member's own records behind the web panel screens (wallet, water history, measurement and
 * workout plan edits, appointment reschedule). The user id always comes from the token; a record
 * of another user answers "not found", exactly like a missing one.
 */
@Injectable()
export class GymMemberRecordsService {
  constructor(private readonly store: GymStore) {}

  async listWallet() {
    return (await this.mine(TENANT_COLLECTION.gymWalletTx))
      .map(toWalletTransaction)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, HISTORY_LIMIT);
  }

  async listWaterLogs() {
    return (await this.mine(TENANT_COLLECTION.gymWaterLogs))
      .map(toWaterLog)
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, HISTORY_LIMIT);
  }

  async updateWater(id: string, dto: UpdateWaterLogDto) {
    await this.own(TENANT_COLLECTION.gymWaterLogs, id, ErrorCode.GYM_WATER_NOT_FOUND, 'Water log not found');
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymWaterLogs,
      id,
      ErrorCode.GYM_WATER_NOT_FOUND,
      'Water log not found',
      {
        ...(dto.amountMl !== undefined ? { amount: dto.amountMl, amountMl: dto.amountMl, unit: 'ml' } : {}),
        date: dto.date,
        notes: dto.notes,
      },
    );
    return toWaterLog(updated);
  }

  async removeWater(id: string) {
    await this.own(TENANT_COLLECTION.gymWaterLogs, id, ErrorCode.GYM_WATER_NOT_FOUND, 'Water log not found');
    return this.store.softDelete(TENANT_COLLECTION.gymWaterLogs, id, ErrorCode.GYM_WATER_NOT_FOUND, 'Water log not found');
  }

  async updateMeasurement(id: string, dto: CreateMeasurementDto) {
    const current = await this.own(
      TENANT_COLLECTION.gymMeasurements,
      id,
      ErrorCode.GYM_MEASUREMENT_NOT_FOUND,
      'Measurement not found',
    );
    const weight = dto.weight ?? numberOrNull(current['weight']);
    const height = dto.height ?? numberOrNull(current['height']);
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymMeasurements,
      id,
      ErrorCode.GYM_MEASUREMENT_NOT_FOUND,
      'Measurement not found',
      { ...dto, bmi: computeBmi(weight, height) },
    );
    return toMeasurement(updated);
  }

  async removeMeasurement(id: string) {
    await this.own(TENANT_COLLECTION.gymMeasurements, id, ErrorCode.GYM_MEASUREMENT_NOT_FOUND, 'Measurement not found');
    return this.store.softDelete(
      TENANT_COLLECTION.gymMeasurements,
      id,
      ErrorCode.GYM_MEASUREMENT_NOT_FOUND,
      'Measurement not found',
    );
  }

  /** Full plans (with exercises) assigned to the member or written by the member. */
  async listWorkoutPlans() {
    return (await this.mine(TENANT_COLLECTION.gymWorkoutPlans))
      .map(toWorkoutPlan)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async createWorkoutPlan(dto: MemberWorkoutPlanDto) {
    const title = dto.title?.trim();
    if (!title) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Plan title is required');
    }
    const created = await this.store.create<Doc>(TENANT_COLLECTION.gymWorkoutPlans, {
      userId: this.store.userId(),
      trainerId: null,
      trainerName: null,
      createdByMember: true,
      templateId: null,
      disciplineId: dto.disciplineId ?? null,
      title,
      description: dto.description ?? '',
      notes: dto.notes ?? '',
      ...normalizePlanContent({ days: dto.days, exercises: dto.exercises ?? [] }),
      status: dto.status ?? 'active',
      startDate: dto.startDate || new Date().toISOString(),
      endDate: dto.endDate ?? null,
    });
    return toWorkoutPlan(created);
  }

  /**
   * A plan the member wrote can be edited freely; on a plan the trainer assigned the member may
   * only change the status (pause, finish, archive).
   */
  async updateWorkoutPlan(id: string, dto: MemberWorkoutPlanDto) {
    const plan = await this.own(TENANT_COLLECTION.gymWorkoutPlans, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found');
    const { status, days, exercises, ...content } = dto;
    const changesContent =
      days !== undefined || exercises !== undefined || Object.values(content).some((value) => value !== undefined);
    if (changesContent && plan['createdByMember'] !== true) {
      throw new AppException(ErrorCode.GYM_MEMBER_FORBIDDEN, 'Only the trainer can edit an assigned plan');
    }
    if (content.title !== undefined && !content.title.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Plan title is required');
    }
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymWorkoutPlans,
      id,
      ErrorCode.GYM_WORKOUT_NOT_FOUND,
      'Workout not found',
      {
        ...content,
        title: content.title?.trim(),
        ...normalizePlanContent({ days, exercises }),
        status,
      },
    );
    return toWorkoutPlan(updated);
  }

  async removeWorkoutPlan(id: string) {
    const plan = await this.own(TENANT_COLLECTION.gymWorkoutPlans, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found');
    if (plan['createdByMember'] !== true) {
      throw new AppException(ErrorCode.GYM_MEMBER_FORBIDDEN, 'Only the trainer can delete an assigned plan');
    }
    return this.store.softDelete(TENANT_COLLECTION.gymWorkoutPlans, id, ErrorCode.GYM_WORKOUT_NOT_FOUND, 'Workout not found');
  }

  /** Moves the member's own booked appointment; the trainer must be free at the new time. */
  async rescheduleAppointment(id: string, dto: UpdateMobileAppointmentDto) {
    const item = await this.own(TENANT_COLLECTION.gymPtAppointments, id, ErrorCode.GYM_PT_NOT_FOUND, 'Appointment not found');
    if (item['status'] !== 'booked') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Only a booked appointment can be changed');
    }
    const time = dto.appointmentTime ?? String(item['appointmentTime']);
    const start = new Date(time).getTime();
    if (Number.isNaN(start) || start <= Date.now()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Appointment time must be in the future');
    }
    const duration = dto.duration ?? (numberOrNull(item['duration']) ?? 60);
    const end = start + duration * 60_000;
    const trainerId = item['trainerId'] ?? null;
    if (trainerId) {
      const existing = await this.store.list<Doc>(TENANT_COLLECTION.gymPtAppointments);
      const conflict = existing.some((other) => {
        if (other.id === id || other['trainerId'] !== trainerId || other['status'] === 'cancelled') return false;
        const otherStart = new Date(String(other['appointmentTime'])).getTime();
        const otherEnd = otherStart + Number(other['duration'] ?? 60) * 60_000;
        return start < otherEnd && end > otherStart;
      });
      if (conflict) {
        throw new AppException(ErrorCode.GYM_PT_CONFLICT, 'Trainer is not available at this time');
      }
    }
    const updated = await this.store.update<Doc>(
      TENANT_COLLECTION.gymPtAppointments,
      id,
      ErrorCode.GYM_PT_NOT_FOUND,
      'Appointment not found',
      { appointmentTime: new Date(start).toISOString(), duration, notes: dto.notes },
    );
    return toAppointment(updated);
  }

  private async mine(collection: string) {
    const userId = this.store.userId();
    return (await this.store.list<Doc>(collection)).filter((item) => item['userId'] === userId);
  }

  private async own(collection: string, id: string, code: ErrorCode, message: string) {
    const item = await this.store.getOrThrow<Doc>(collection, id, code, message);
    if (item['userId'] !== this.store.userId()) {
      throw new AppException(code, message);
    }
    return item;
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toWalletTransaction(item: Doc) {
  return {
    id: item.id,
    userId: String(item['userId'] ?? ''),
    type: String(item['type'] ?? 'deposit'),
    amount: Number(item['amount'] ?? 0),
    description: String(item['description'] ?? 'Cüzdan hareketi'),
    referenceId: stringOrNull(item['referenceId']),
    referenceType: stringOrNull(item['referenceType']),
    status: String(item['status'] ?? 'completed'),
    paymentMethod: stringOrNull(item['paymentMethod']),
    notes: String(item['notes'] ?? ''),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toWaterLog(item: Doc) {
  const unit = String(item['unit'] ?? 'ml');
  return {
    id: item.id,
    userId: String(item['userId'] ?? ''),
    date: String(item['date'] ?? item.createdAt),
    amount: Number(item['amount'] ?? item['amountMl'] ?? 0),
    unit,
    notes: String(item['notes'] ?? ''),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function toWorkoutPlan(item: Doc) {
  return {
    id: item.id,
    userId: String(item['userId'] ?? ''),
    templateId: stringOrNull(item['templateId']),
    trainerId: stringOrNull(item['trainerId']),
    trainerName: stringOrNull(item['trainerName']),
    disciplineId: stringOrNull(item['disciplineId']),
    createdByMember: item['createdByMember'] === true,
    title: String(item['title'] ?? 'Program'),
    description: String(item['description'] ?? ''),
    notes: String(item['notes'] ?? ''),
    ...planContent(item),
    status: String(item['status'] ?? 'active'),
    startDate: String(item['startDate'] ?? item.createdAt),
    endDate: stringOrNull(item['endDate']),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}


import { Injectable } from '@nestjs/common';
import { AuditService } from '../../../../shared/audit/audit.service';
import { AuditAction } from '../../../../shared/audit/audit.types';
import { AppException } from '../../../../shared/errors/app.exception';
import { ErrorCode } from '../../../../shared/errors/error-codes';
import { FirebaseService } from '../../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../../shared/firestore/base-document';
import { TenantContext } from '../../../../shared/tenancy/tenant.context';
import { CreateVaccineScheduleDto, ListVaccineSchedulesQueryDto, UpdateVaccineScheduleDto } from './vaccine-schedule.dto';
import { VaccineSchedule } from './vaccine-schedule.entity';

export interface VaccineScheduleWrite extends CreateVaccineScheduleDto {
  customerId: string;
  vaccineName: string;
  animalType: string | null;
}

@Injectable()
export class VaccineSchedulesRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.vaccineSchedules),
    );
  }

  async create(dto: VaccineScheduleWrite): Promise<VaccineSchedule> {
    const ref = this.collection().doc();
    const item: VaccineSchedule = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      patientId: dto.patientId,
      customerId: dto.customerId,
      vaccineId: dto.vaccineId,
      vaccineName: dto.vaccineName,
      animalType: dto.animalType,
      dueAt: dto.dueAt,
      done: dto.done ?? false,
      doneAt: dto.done ? (dto.doneAt ?? new Date().toISOString()) : null,
      note: dto.note ?? null,
    };
    await ref.set(item);
    await this.audit.record({
      action: AuditAction.VACCINE_SCHEDULE_CREATED,
      entity: 'vaccineSchedule',
      entityId: item.id,
    });
    return item;
  }

  async findById(id: string): Promise<VaccineSchedule | null> {
    const snapshot = await this.collection().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const item = snapshot.data() as VaccineSchedule;
    return isDeleted(item) ? null : item;
  }

  async getByIdOrThrow(id: string): Promise<VaccineSchedule> {
    const item = await this.findById(id);
    if (!item) {
      throw new AppException(ErrorCode.VACCINE_SCHEDULE_NOT_FOUND, 'Vaccine schedule not found');
    }
    return item;
  }

  async collect(query: ListVaccineSchedulesQueryDto = {}): Promise<VaccineSchedule[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs
      .map((doc) => doc.data() as VaccineSchedule)
      .filter((item) => !isDeleted(item))
      .filter((item) => (query.patientId ? item.patientId === query.patientId : true))
      .filter((item) => (query.vaccineId ? item.vaccineId === query.vaccineId : true))
      .filter((item) => (query.done === undefined ? true : item.done === query.done))
      .filter((item) => inDueRange(item.dueAt, query.from, query.to))
      .sort((left, right) => compareVaccineSchedulesForList(left, right));
  }

  async update(id: string, dto: UpdateVaccineScheduleDto, names?: Partial<VaccineScheduleWrite>): Promise<VaccineSchedule> {
    const current = await this.getByIdOrThrow(id);
    const done = dto.done ?? current.done;
    const updated: VaccineSchedule = {
      ...current,
      ...omitUndefined(dto),
      ...names,
      done,
      doneAt: done ? (dto.doneAt ?? current.doneAt ?? new Date().toISOString()) : null,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };
    await this.collection().doc(id).set(updated);
    await this.audit.record({
      action: AuditAction.VACCINE_SCHEDULE_UPDATED,
      entity: 'vaccineSchedule',
      entityId: id,
    });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    await this.getByIdOrThrow(id);
    await this.collection().doc(id).update({
      deletedAt: new Date().toISOString(),
      ...touchBaseFields(this.tenantContext.getUserId()),
    });
    await this.audit.record({
      action: AuditAction.VACCINE_SCHEDULE_DELETED,
      entity: 'vaccineSchedule',
      entityId: id,
    });
  }
}

const CLINIC_TIME_ZONE = 'Europe/Istanbul';

export function clinicDateKey(value: string | Date, timeZone = CLINIC_TIME_ZONE): string {
  return new Date(value).toLocaleDateString('en-CA', { timeZone });
}

function inDueRange(value: string, from?: string, to?: string): boolean {
  if (!from && !to) {
    return true;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  if (from && date < new Date(from)) {
    return false;
  }
  if (to && date > new Date(to)) {
    return false;
  }
  return true;
}

export function compareVaccineSchedulesForList(
  left: VaccineSchedule,
  right: VaccineSchedule,
  todayKey = clinicDateKey(new Date()),
): number {
  const leftToday = clinicDateKey(left.dueAt) === todayKey ? 0 : 1;
  const rightToday = clinicDateKey(right.dueAt) === todayKey ? 0 : 1;
  if (leftToday !== rightToday) {
    return leftToday - rightToday;
  }
  return right.dueAt.localeCompare(left.dueAt) || right.id.localeCompare(left.id);
}

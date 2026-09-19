import { Injectable } from '@nestjs/common';
import { Query } from 'firebase-admin/firestore';
import { AuditService } from '../../../shared/audit/audit.service';
import { AuditAction } from '../../../shared/audit/audit.types';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { paginateQuery } from '../../../shared/firestore/paginate';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { ListAppointmentsQueryDto } from './dto/list-appointments.query.dto';
import { UpdateAppointmentDto } from './dto/update-appointment.dto';
import { Appointment, AppointmentStatus } from './entities/appointment.entity';
import { isAlreadyExistsError, reservationSlotIds } from './reservation-slots';

@Injectable()
export class AppointmentsRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditService,
  ) {}

  private appointments() {
    return this.firebase.db.collection(
      tenantCollectionPath(this.tenantContext.getTenantId(), TENANT_COLLECTION.appointments),
    );
  }

  private reservations() {
    return this.firebase.db.collection(
      tenantCollectionPath(
        this.tenantContext.getTenantId(),
        TENANT_COLLECTION.appointmentReservations,
      ),
    );
  }

  async create(dto: CreateAppointmentDto): Promise<Appointment> {
    const beginAt = new Date(dto.beginAt);
    const endAt = new Date(dto.endAt);
    const slotIds = reservationSlotIds(dto.doctorId, beginAt, endAt);
    const ref = this.appointments().doc();
    const appointment: Appointment = {
      ...createBaseFields(ref.id, this.tenantContext.getUserId()),
      beginAt: beginAt.toISOString(),
      endAt: endAt.toISOString(),
      customerId: dto.customerId,
      patientId: dto.patientId,
      doctorId: dto.doctorId,
      type: dto.type,
      note: dto.note ?? null,
      status: 'scheduled',
      reservationSlotIds: slotIds,
    };

    try {
      await this.firebase.db.runTransaction(async (tx) => {
        for (const slotId of slotIds) {
          tx.create(this.reservations().doc(slotId), {
            appointmentId: appointment.id,
            doctorId: dto.doctorId,
            slotId,
          });
        }
        tx.create(ref, appointment);
      });
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new AppException(
          ErrorCode.APPOINTMENT_CONFLICT,
          'Doctor already has an overlapping appointment',
        );
      }
      throw error;
    }

    await this.audit.record({
      action: AuditAction.APPOINTMENT_CREATED,
      entity: 'appointment',
      entityId: appointment.id,
    });
    return appointment;
  }

  async findById(id: string): Promise<Appointment | null> {
    const snapshot = await this.appointments().doc(id).get();
    if (!snapshot.exists) {
      return null;
    }
    const appointment = snapshot.data() as Appointment;
    if (isDeleted(appointment)) {
      return null;
    }
    return appointment;
  }

  async getByIdOrThrow(id: string): Promise<Appointment> {
    const appointment = await this.findById(id);
    if (!appointment) {
      throw new AppException(ErrorCode.APPOINTMENT_NOT_FOUND, 'Appointment not found');
    }
    return appointment;
  }

  async list(query: ListAppointmentsQueryDto) {
    if (query.from || query.to) {
      return paginateInMemory(await this.collect(query), query.limit, query.cursor);
    }
    let firestoreQuery: Query = this.appointments().where('deletedAt', '==', null);
    if (query.status) {
      firestoreQuery = firestoreQuery.where('status', '==', query.status);
    }
    if (query.doctorId) {
      firestoreQuery = firestoreQuery.where('doctorId', '==', query.doctorId);
    }
    if (query.patientId) {
      firestoreQuery = firestoreQuery.where('patientId', '==', query.patientId);
    }
    if (query.customerId) {
      firestoreQuery = firestoreQuery.where('customerId', '==', query.customerId);
    }
    return paginateQuery<Appointment>(firestoreQuery, query.limit, query.cursor);
  }

  async collect(query: ListAppointmentsQueryDto): Promise<Appointment[]> {
    const snapshot = await this.appointments().get();
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    return snapshot.docs
      .map((doc) => doc.data() as Appointment)
      .filter((item) => !isDeleted(item))
      .filter((item) => (query.status ? item.status === query.status : true))
      .filter((item) => (query.doctorId ? item.doctorId === query.doctorId : true))
      .filter((item) => (query.patientId ? item.patientId === query.patientId : true))
      .filter((item) => (query.customerId ? item.customerId === query.customerId : true))
      .filter((item) => inBeginRange(item.beginAt, from, to))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
  }

  async update(id: string, dto: UpdateAppointmentDto): Promise<Appointment> {
    const current = await this.getByIdOrThrow(id);
    if (current.status === 'cancelled') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Cancelled appointments cannot be updated');
    }

    const nextDoctorId = dto.doctorId ?? current.doctorId;
    const nextBegin = new Date(dto.beginAt ?? current.beginAt);
    const nextEnd = new Date(dto.endAt ?? current.endAt);
    const nextSlots = reservationSlotIds(nextDoctorId, nextBegin, nextEnd);
    const updated: Appointment = {
      ...current,
      beginAt: nextBegin.toISOString(),
      endAt: nextEnd.toISOString(),
      customerId: dto.customerId ?? current.customerId,
      patientId: dto.patientId ?? current.patientId,
      doctorId: nextDoctorId,
      type: dto.type ?? current.type,
      note: dto.note ?? current.note,
      reservationSlotIds: nextSlots,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };

    try {
      await this.firebase.db.runTransaction(async (tx) => {
        for (const slotId of current.reservationSlotIds) {
          tx.delete(this.reservations().doc(slotId));
        }
        for (const slotId of nextSlots) {
          tx.create(this.reservations().doc(slotId), {
            appointmentId: current.id,
            doctorId: nextDoctorId,
            slotId,
          });
        }
        tx.set(this.appointments().doc(id), updated);
      });
    } catch (error) {
      if (isAlreadyExistsError(error)) {
        throw new AppException(
          ErrorCode.APPOINTMENT_CONFLICT,
          'Doctor already has an overlapping appointment',
        );
      }
      throw error;
    }

    await this.audit.record({
      action: AuditAction.APPOINTMENT_UPDATED,
      entity: 'appointment',
      entityId: id,
    });
    return updated;
  }

  async updateStatus(id: string, status: AppointmentStatus): Promise<Appointment> {
    const current = await this.getByIdOrThrow(id);
    if (current.status === status) {
      return current;
    }
    if (current.status === 'cancelled' && status !== 'cancelled') {
      throw new AppException(ErrorCode.INVALID_STATUS, 'Cancelled appointments cannot change status');
    }

    const updated: Appointment = {
      ...current,
      status,
      ...touchBaseFields(this.tenantContext.getUserId()),
    };

    await this.firebase.db.runTransaction(async (tx) => {
      if (status === 'cancelled') {
        for (const slotId of current.reservationSlotIds) {
          tx.delete(this.reservations().doc(slotId));
        }
        updated.reservationSlotIds = [];
      }
      tx.set(this.appointments().doc(id), updated);
    });

    await this.audit.record({
      action:
        status === 'cancelled' ? AuditAction.APPOINTMENT_CANCELLED : AuditAction.APPOINTMENT_UPDATED,
      entity: 'appointment',
      entityId: id,
    });
    return updated;
  }

  async softDelete(id: string): Promise<void> {
    const current = await this.getByIdOrThrow(id);
    await this.firebase.db.runTransaction(async (tx) => {
      for (const slotId of current.reservationSlotIds) {
        tx.delete(this.reservations().doc(slotId));
      }
      tx.update(this.appointments().doc(id), {
        deletedAt: new Date().toISOString(),
        reservationSlotIds: [],
        ...touchBaseFields(this.tenantContext.getUserId()),
      });
    });
    await this.audit.record({
      action: AuditAction.APPOINTMENT_CANCELLED,
      entity: 'appointment',
      entityId: id,
    });
  }
}

function inBeginRange(value: string, from?: Date, to?: Date): boolean {
  if (!from && !to) {
    return true;
  }
  const begin = new Date(value);
  if (from && begin < from) {
    return false;
  }
  if (to && begin > to) {
    return false;
  }
  return true;
}

import { Injectable } from '@nestjs/common';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import { spaNotFound, spaPrecondition } from '../shared/spa-errors';
import { SpaDoc, SpaStore } from '../shared/spa-store';
import { workHoursViolation } from '../shared/spa-time';
import {
  AppointmentStatus,
  OPEN_APPOINTMENT_STATUSES,
  SaveSpaAppointmentDto,
  SetSpaAppointmentStatusDto,
} from './appointment.dto';

const MAX_APPOINTMENT_MS = 12 * 60 * 60 * 1000;
/** Small grace so a booking made "now" from a slow form isn't rejected as being in the past. */
const PAST_GRACE_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND = 'Randevu bulunamadı.';

@Injectable()
export class SpaAppointmentsService {
  constructor(private readonly store: SpaStore) {}

  list(from?: string, to?: string, staffId?: string, customerId?: string) {
    return this.store.list(TENANT_COLLECTION.spaAppointments, {
      dateField: 'start',
      from,
      to,
      equals: { staffId, customerId },
      orderBy: { field: 'start', dir: 'asc' },
    });
  }

  get(id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.spaAppointments, id, NOT_FOUND);
  }

  /** Creates (no id) or edits an appointment with staff/room overlap, leave and working-hours checks. */
  async save(dto: SaveSpaAppointmentDto, id?: string) {
    const start = new Date(dto.start);
    const schedule = await this.store.schedule();
    const userId = this.store.userId();
    const col = (name: string) => this.store.collection(name);

    const savedId = await this.store.runTransaction(async (tx) => {
      const existingRef = id ? col(TENANT_COLLECTION.spaAppointments).doc(id) : null;
      const existingSnap = existingRef ? await tx.get(existingRef) : null;
      const existing = existingSnap?.exists ? (existingSnap.data() as SpaDoc) : null;
      if (existingRef && (!existing || isDeleted(existing))) throw spaNotFound(NOT_FOUND);
      if (
        existing &&
        !OPEN_APPOINTMENT_STATUSES.includes(existing['status'] as AppointmentStatus)
      ) {
        throw spaPrecondition('Tamamlanan, iptal edilen veya gelinmeyen randevu düzenlenemez.');
      }
      // Editing notes on an appointment that has already started must not trip the past-time check.
      const startUnchanged = existing && Date.parse(String(existing['start'])) === start.getTime();
      if (!startUnchanged && start.getTime() < Date.now() - PAST_GRACE_MS) {
        throw spaPrecondition('Geçmiş bir saate randevu verilemez.');
      }

      const [serviceSnap, staffSnap, roomSnap, customerSnap] = await Promise.all([
        tx.get(col(TENANT_COLLECTION.spaServices).doc(dto.serviceId)),
        tx.get(col(TENANT_COLLECTION.spaStaff).doc(dto.staffId)),
        tx.get(col(TENANT_COLLECTION.spaRooms).doc(dto.roomId)),
        tx.get(col(TENANT_COLLECTION.spaCustomers).doc(dto.customerId)),
      ]);
      const service = liveData(serviceSnap);
      const staff = liveData(staffSnap);
      const room = liveData(roomSnap);
      const customer = liveData(customerSnap);
      if (!service || !staff || !room || !customer) {
        throw spaNotFound('Müşteri, terapist, oda veya hizmet bulunamadı.');
      }
      if (staff['active'] === false || room['active'] === false) {
        throw spaPrecondition('Terapist veya oda aktif değil.');
      }
      if (customer['active'] === false) throw spaPrecondition('Müşteri pasif durumda.');
      if (service['active'] === false) throw spaPrecondition('Hizmet aktif değil.');

      const end = new Date(start.getTime() + Number(service['sureDk']) * 60000);
      const outsideHours = startUnchanged ? null : workHoursViolation(start, end, schedule);
      if (outsideHours) throw spaPrecondition(outsideHours);

      // One range query on `start` (no composite index); staff/room matching happens in memory.
      const [nearby, leaves] = await Promise.all([
        tx.get(
          col(TENANT_COLLECTION.spaAppointments)
            .where('start', '>=', new Date(start.getTime() - MAX_APPOINTMENT_MS).toISOString())
            .where('start', '<', end.toISOString()),
        ),
        tx.get(col(TENANT_COLLECTION.spaStaffLeaves).where('staffId', '==', dto.staffId)),
      ]);

      const overlapping = nearby.docs
        .filter((doc) => doc.id !== id)
        .map((doc) => doc.data() as SpaDoc)
        .filter(
          (a) =>
            !isDeleted(a) &&
            a['status'] !== 'İptal' &&
            start.getTime() < Date.parse(String(a['end'])) &&
            end.getTime() > Date.parse(String(a['start'])),
        );
      if (overlapping.some((a) => a['staffId'] === dto.staffId)) {
        throw spaPrecondition('Terapistin bu saatte başka randevusu var.');
      }
      if (overlapping.some((a) => a['roomId'] === dto.roomId)) {
        throw spaPrecondition('Oda bu saatte dolu.');
      }

      const onLeave = leaves.docs.some((doc) => {
        const leave = doc.data() as SpaDoc;
        // Pending/rejected requests don't block.
        if (isDeleted(leave) || (leave['status'] && leave['status'] !== 'onaylandi')) return false;
        const leaveEnd = Date.parse(String(leave['endDate'])) + DAY_MS; // end date is inclusive
        return start.getTime() < leaveEnd && end.getTime() > Date.parse(String(leave['startDate']));
      });
      if (onLeave) throw spaPrecondition('Terapist bu tarihte izinli.');

      const now = new Date().toISOString();
      const payload = {
        customerId: dto.customerId,
        staffId: dto.staffId,
        roomId: dto.roomId,
        serviceId: dto.serviceId,
        start: start.toISOString(),
        end: end.toISOString(),
        notes: dto.notes ?? null,
      };
      if (existingRef) {
        tx.update(existingRef, { ...payload, updatedAt: now, updatedBy: userId });
        return existingRef.id;
      }
      const ref = col(TENANT_COLLECTION.spaAppointments).doc();
      tx.set(ref, { ...createBaseFields(ref.id, userId, now), ...payload, status: 'Bekliyor' });
      return ref.id;
    });

    await this.store.audit('appointments', 'callable', savedId, null, {
      staffId: dto.staffId,
      roomId: dto.roomId,
      start: dto.start,
    });
    return this.get(savedId);
  }

  /** Manual status changes (confirm, arrived, no-show, cancel) on an still-open appointment. */
  async setStatus(id: string, dto: SetSpaAppointmentStatusDto) {
    const current = await this.get(id);
    if (!OPEN_APPOINTMENT_STATUSES.includes(current['status'] as AppointmentStatus)) {
      throw spaPrecondition(
        'Tamamlanan, iptal edilen veya gelinmeyen randevunun durumu değiştirilemez.',
      );
    }
    return this.store.update(
      TENANT_COLLECTION.spaAppointments,
      'appointments',
      id,
      { status: dto.status },
      NOT_FOUND,
    );
  }
}

function liveData(snapshot: DocumentSnapshot): SpaDoc | null {
  const data = snapshot.exists ? (snapshot.data() as SpaDoc) : null;
  return data && !isDeleted(data) ? data : null;
}

import { Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { effectiveSubscription, TenantBillingState } from '../payments/saas-billing';
import { APM_PLANS, ApmPlanId, ApmPlanLimitException, ApmSubscriptionRequiredException, isApmPlan, istanbulMonthStart } from './apm-plans';
import { ApmAppointmentStatus, SaveApmAppointmentDto } from './apm.dto';

export interface ApmAppointment {
  id: string;
  title: string;
  customerName: string;
  staffName: string;
  startAt: string;
  endAt: string;
  status: ApmAppointmentStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  updatedBy?: string;
  deletedAt?: string;
}

const MAX_DURATION_MS = 24 * 60 * 60 * 1000;

export interface ApmSubscription {
  /** trial | active | expired (or another tenant status such as suspended). */
  membershipStatus: string;
  planId: ApmPlanId | null;
  planName: string | null;
  trialEndsAt: string | null;
  subscriptionEndsAt: string | null;
  inGrace: boolean;
  /** Appointments created this calendar month (Türkiye time), deleted ones included. */
  usedThisMonth: number;
  /** null = unlimited. */
  monthlyLimit: number | null;
  canCreate: boolean;
  plans: { id: ApmPlanId; name: string; monthlyPrice: number; monthlyAppointments: number | null }[];
}

@Injectable()
export class ApmService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async appointments(from?: string, to?: string): Promise<ApmAppointment[]> {
    let query = this.collection().orderBy('startAt', 'asc');
    if (from) query = query.where('startAt', '>=', from);
    if (to) query = query.where('startAt', '<', to);
    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => ({ id: doc.id, ...(doc.data() as Omit<ApmAppointment, 'id'>) }))
      .filter((appointment) => !('deletedAt' in appointment));
  }

  async dashboard(): Promise<{ appointments: ApmAppointment[]; counts: Record<string, number> }> {
    const appointments = await this.appointments();
    const counts = appointments.reduce<Record<string, number>>((acc, appointment) => {
      acc[appointment.status] = (acc[appointment.status] ?? 0) + 1;
      return acc;
    }, {});
    return { appointments, counts };
  }

  async get(id: string): Promise<ApmAppointment> {
    const snapshot = await this.collection().doc(id).get();
    const data = snapshot.exists ? (snapshot.data() as Omit<ApmAppointment, 'id'>) : undefined;
    if (!data || data.deletedAt) {
      throw new AppException(ErrorCode.APPOINTMENT_NOT_FOUND, 'Randevu bulunamadı.');
    }
    return { ...data, id };
  }

  /** Package, trial/subscription state and this month's usage; drives the APM subscription page. */
  async subscription(): Promise<ApmSubscription> {
    const tenantId = this.tenantContext.getTenantId();
    const [tenantSnapshot, subscriptionSnapshot, used] = await Promise.all([
      this.firebase.db.doc(`tenants/${tenantId}`).get(),
      this.firebase.db.doc(`${tenantCollectionPath(tenantId, TENANT_COLLECTION.gymSaasSubscription)}/${tenantId}`).get(),
      this.collection().where('createdAt', '>=', istanbulMonthStart()).count().get(),
    ]);
    const tenant = (tenantSnapshot.data() ?? {}) as TenantBillingState;
    const state = effectiveSubscription(tenant);
    const storedPlan = (subscriptionSnapshot.data() as { planId?: string } | undefined)?.planId;
    const planId = state.membershipStatus === 'active' && isApmPlan(storedPlan) ? storedPlan : null;
    // A trial is unlimited; an active subscription without an APM package (e.g. set by hand) is treated as Premium.
    const monthlyLimit = planId ? APM_PLANS[planId].monthlyAppointments : null;
    const usedThisMonth = used.data().count;
    const isOpen = state.membershipStatus === 'trial' || state.membershipStatus === 'active';
    return {
      membershipStatus: state.membershipStatus,
      planId,
      planName: planId ? APM_PLANS[planId].name : null,
      trialEndsAt: tenant.trialEndsAt ?? null,
      subscriptionEndsAt: state.subscriptionEndsAt,
      inGrace: state.inGrace,
      usedThisMonth,
      monthlyLimit,
      canCreate: isOpen && (monthlyLimit === null || usedThisMonth < monthlyLimit),
      plans: (Object.keys(APM_PLANS) as ApmPlanId[]).map((id) => ({ id, ...APM_PLANS[id] })),
    };
  }

  /** Creates the appointment, or replaces the editable fields of `id`. Rejects overlaps for the same staff member (409). */
  async save(dto: SaveApmAppointmentDto, id?: string): Promise<ApmAppointment> {
    const current = id ? await this.get(id) : undefined;
    if (!current) await this.assertCanCreate();
    const fields = this.normalize(dto, current?.status);
    if (fields.status !== 'Cancelled') {
      await this.assertNoConflict(fields, id);
    }

    const now = new Date().toISOString();
    const userId = this.tenantContext.getUserId();
    const ref = id ? this.collection().doc(id) : this.collection().doc();
    const appointment: ApmAppointment = {
      ...(current ?? { createdAt: now, createdBy: userId }),
      ...fields,
      id: ref.id,
      updatedAt: now,
      updatedBy: userId,
    };
    if (!fields.notes) delete appointment.notes;
    await ref.set(appointment);
    return appointment;
  }

  async setStatus(id: string, status: ApmAppointmentStatus): Promise<ApmAppointment> {
    const current = await this.get(id);
    if (status !== 'Cancelled' && current.status === 'Cancelled') {
      await this.assertNoConflict(current, id);
    }
    const appointment: ApmAppointment = {
      ...current,
      status,
      updatedAt: new Date().toISOString(),
      updatedBy: this.tenantContext.getUserId(),
    };
    await this.collection().doc(id).set(appointment);
    return appointment;
  }

  /** Soft delete: the record stays in Firestore with `deletedAt` and disappears from every list. */
  async remove(id: string): Promise<{ id: string }> {
    await this.get(id);
    const now = new Date().toISOString();
    await this.collection().doc(id).update({ deletedAt: now, updatedAt: now, updatedBy: this.tenantContext.getUserId() });
    return { id };
  }

  private async assertCanCreate(): Promise<void> {
    const subscription = await this.subscription();
    if (subscription.membershipStatus !== 'trial' && subscription.membershipStatus !== 'active') {
      throw new ApmSubscriptionRequiredException();
    }
    if (subscription.monthlyLimit !== null && subscription.usedThisMonth >= subscription.monthlyLimit) {
      throw new ApmPlanLimitException(subscription.monthlyLimit);
    }
  }

  private normalize(dto: SaveApmAppointmentDto, currentStatus?: ApmAppointmentStatus) {
    const start = new Date(dto.startAt);
    const end = new Date(dto.endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Başlangıç ve bitiş zamanı geçerli olmalı.');
    }
    if (end <= start) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Bitiş zamanı başlangıçtan sonra olmalı.');
    }
    if (end.getTime() - start.getTime() > MAX_DURATION_MS) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Bir randevu en fazla 24 saat sürebilir.');
    }
    const title = dto.title.trim();
    const customerName = dto.customerName.trim();
    const staffName = dto.staffName.trim();
    if (!title || !customerName || !staffName) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Başlık, müşteri ve personel boş olamaz.');
    }
    return {
      title,
      customerName,
      staffName,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      status: dto.status ?? currentStatus ?? 'Pending',
      notes: dto.notes?.trim() || undefined,
    };
  }

  private async assertNoConflict(
    appointment: Pick<ApmAppointment, 'staffName' | 'startAt' | 'endAt'>,
    excludeId?: string,
  ): Promise<void> {
    // Appointments last at most 24 h, so anything overlapping starts within a day before this one ends.
    const from = new Date(new Date(appointment.startAt).getTime() - MAX_DURATION_MS).toISOString();
    const staff = appointment.staffName.trim().toLocaleLowerCase('tr-TR');
    const overlapping = (await this.appointments(from, appointment.endAt)).find(
      (other) =>
        other.id !== excludeId &&
        other.status !== 'Cancelled' &&
        other.staffName?.trim().toLocaleLowerCase('tr-TR') === staff &&
        other.startAt < appointment.endAt &&
        other.endAt > appointment.startAt,
    );
    if (overlapping) {
      throw new AppException(
        ErrorCode.APPOINTMENT_CONFLICT,
        `${appointment.staffName} bu saatte başka bir randevuda: ${overlapping.title}.`,
      );
    }
  }

  private collection() {
    const tenantId = this.tenantContext.getTenantId();
    return this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.apmAppointments));
  }
}

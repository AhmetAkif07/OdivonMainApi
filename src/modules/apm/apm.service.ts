import { Injectable, Optional } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { effectiveSubscription, TenantBillingState } from '../payments/saas-billing';
import { APM_PLANS, ApmPlanId, ApmPlanLimitException, ApmSubscriptionRequiredException, isApmPlan, istanbulMonthStart } from './apm-plans';
import { ApmAppointmentStatus, SaveApmAppointmentDto } from './apm.dto';
import { ApmNotificationsService } from './apm-notifications.service';
import { SaasPricingService, STATIC_SAAS_PRICING } from '../saas-pricing/saas-pricing.service';
import { appointmentSlotIds } from './apm-time';

export interface ApmAppointment {
  id: string;
  title: string;
  customerName: string;
  staffName: string;
  startAt: string;
  endAt: string;
  status: ApmAppointmentStatus;
  notes?: string;
  branchId?: string;
  branchName?: string;
  bookingSlug?: string;
  serviceId?: string;
  serviceName?: string;
  staffId?: string;
  durationMinutes?: number;
  customerEmail?: string;
  customerPhone?: string;
  source?: 'admin' | 'guest';
  bookingTokenHash?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
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

export interface CreateGuestApmAppointment {
  branchId: string;
  branchName: string;
  bookingSlug?: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  durationMinutes: number;
  startAt: string;
  endAt: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes?: string;
  bookingTokenHash: string;
}

@Injectable()
export class ApmService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly notifications: ApmNotificationsService,
    @Optional() private readonly pricing: SaasPricingService = STATIC_SAAS_PRICING,
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
    const [tenantSnapshot, subscriptionSnapshot, used, catalog] = await Promise.all([
      this.firebase.db.doc(`tenants/${tenantId}`).get(),
      this.firebase.db.doc(`${tenantCollectionPath(tenantId, TENANT_COLLECTION.gymSaasSubscription)}/${tenantId}`).get(),
      this.collection().where('createdAt', '>=', istanbulMonthStart()).count().get(),
      this.pricing.catalog(),
    ]);
    // Names and prices come from the platform panel; the quota stays with the package id.
    const priced = new Map(catalog.plans.map((plan) => [plan.id, plan]));
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
      planName: planId ? (priced.get(planId)?.name ?? APM_PLANS[planId].name) : null,
      trialEndsAt: tenant.trialEndsAt ?? null,
      subscriptionEndsAt: state.subscriptionEndsAt,
      inGrace: state.inGrace,
      usedThisMonth,
      monthlyLimit,
      canCreate: isOpen && (monthlyLimit === null || usedThisMonth < monthlyLimit),
      plans: (Object.keys(APM_PLANS) as ApmPlanId[])
        .filter((id) => priced.get(id)?.active !== false && priced.get(id)?.monthly !== null)
        .map((id) => ({
          id,
          ...APM_PLANS[id],
          name: priced.get(id)?.name ?? APM_PLANS[id].name,
          monthlyPrice: priced.get(id)?.monthly ?? APM_PLANS[id].monthlyPrice,
        })),
    };
  }

  /** Creates the appointment, or replaces the editable fields of `id`. Rejects overlaps for the same staff member (409). */
  async save(dto: SaveApmAppointmentDto, id?: string): Promise<ApmAppointment> {
    const current = id ? await this.get(id) : undefined;
    if (!current) await this.assertCanCreate();
    const structured = dto.branchId || dto.serviceId || dto.staffId || current?.branchId
      ? await this.structuredFields(dto, current)
      : undefined;
    const fields = this.normalize(structured ? { ...dto, ...structured } : dto, current?.status);
    if (fields.status !== 'Cancelled' && !fields.staffId) {
      await this.assertNoConflict(fields, id);
    }

    const now = new Date().toISOString();
    const userId = this.tenantContext.getUserId();
    const ref = id ? this.collection().doc(id) : this.collection().doc();
    const appointment: ApmAppointment = {
      ...(current ?? { createdAt: now, createdBy: userId }),
      ...fields,
      id: ref.id,
      source: current?.source ?? 'admin',
      updatedAt: now,
      updatedBy: userId,
    };
    if (!fields.notes) delete appointment.notes;
    await this.writeWithSlotLocks(appointment, current);
    return appointment;
  }

  async createGuestAppointment(input: CreateGuestApmAppointment): Promise<ApmAppointment> {
    await this.assertCanCreate();
    const now = new Date().toISOString();
    const ref = this.collection().doc();
    const appointment: ApmAppointment = {
      id: ref.id,
      title: input.serviceName,
      customerName: input.customerName,
      staffName: input.staffName,
      startAt: new Date(input.startAt).toISOString(),
      endAt: new Date(input.endAt).toISOString(),
      status: 'Pending',
      notes: input.notes,
      branchId: input.branchId,
      branchName: input.branchName,
      bookingSlug: input.bookingSlug,
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      staffId: input.staffId,
      durationMinutes: input.durationMinutes,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      source: 'guest',
      bookingTokenHash: input.bookingTokenHash,
      createdAt: now,
      createdBy: this.tenantContext.getUserId(),
      updatedAt: now,
      updatedBy: this.tenantContext.getUserId(),
    };
    await this.writeWithSlotLocks(appointment);
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
      ...(status === 'Confirmed' ? { confirmedAt: new Date().toISOString() } : {}),
      ...(status === 'Cancelled' ? { cancelledAt: new Date().toISOString(), cancelledBy: this.tenantContext.getUserId() } : {}),
      updatedAt: new Date().toISOString(),
      updatedBy: this.tenantContext.getUserId(),
    };
    await this.writeWithSlotLocks(appointment, current);
    await this.notifyGuestOfStatus(appointment);
    return appointment;
  }

  /** Soft delete: the record stays in Firestore with `deletedAt` and disappears from every list. */
  async remove(id: string): Promise<{ id: string }> {
    const now = new Date().toISOString();
    const current = await this.get(id);
    await this.writeWithSlotLocks({
      ...current,
      deletedAt: now,
      updatedAt: now,
      updatedBy: this.tenantContext.getUserId(),
    }, current, true);
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
      branchId: dto.branchId,
      serviceId: dto.serviceId,
      staffId: dto.staffId,
      serviceName: dto.title.trim(),
      durationMinutes: dto.durationMinutes,
      customerEmail: dto.customerEmail?.trim().toLowerCase() || undefined,
      customerPhone: dto.customerPhone?.trim() || undefined,
    };
  }

  private async structuredFields(dto: SaveApmAppointmentDto, current?: ApmAppointment) {
    const branchId = dto.branchId ?? current?.branchId;
    const serviceId = dto.serviceId ?? current?.serviceId;
    const staffId = dto.staffId ?? current?.staffId;
    if (!branchId || !serviceId || !staffId) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Şube, hizmet ve personel birlikte seçilmeli.');
    }
    const [branchSnapshot, serviceSnapshot, staffSnapshot] = await Promise.all([
      this.tenantCollection(TENANT_COLLECTION.apmBranches).doc(branchId).get(),
      this.tenantCollection(TENANT_COLLECTION.apmServices).doc(serviceId).get(),
      this.tenantCollection(TENANT_COLLECTION.apmStaff).doc(staffId).get(),
    ]);
    const branch = branchSnapshot.data();
    const service = serviceSnapshot.data();
    const staff = staffSnapshot.data();
    if (!branchSnapshot.exists || !serviceSnapshot.exists || !staffSnapshot.exists || branch?.['deletedAt'] || service?.['deletedAt'] || staff?.['deletedAt']) {
      throw new AppException(ErrorCode.APPOINTMENT_NOT_FOUND, 'Şube, hizmet veya personel bulunamadı.');
    }
    const serviceBranches = stringList(service?.['branchIds']);
    const staffBranches = stringList(staff?.['branchIds']);
    const staffServices = stringList(staff?.['serviceIds']);
    if (!serviceBranches.includes(branchId) || !staffBranches.includes(branchId) || !staffServices.includes(serviceId)) {
      throw new AppException(ErrorCode.APPOINTMENT_INVALID, 'Personel veya hizmet seçilen şubede uygun değil.');
    }
    const serviceName = String(service?.['name'] ?? '').trim();
    const staffName = String(staff?.['displayName'] ?? '').trim();
    const durationMinutes = Number(service?.['durationMinutes']);
    return {
      branchId,
      branchName: String(branch?.['name'] ?? '').trim(),
      serviceId,
      serviceName,
      staffId,
      title: serviceName,
      staffName,
      durationMinutes,
    };
  }

  private async writeWithSlotLocks(appointment: ApmAppointment, current?: ApmAppointment, releaseOnly = false): Promise<void> {
    const locks = this.tenantCollection(TENANT_COLLECTION.apmAppointmentSlots);
    const oldIds = current?.staffId && activeStatus(current.status)
      ? appointmentSlotIds(current.staffId, current.startAt, current.endAt)
      : [];
    const newIds = !releaseOnly && appointment.staffId && activeStatus(appointment.status)
      ? appointmentSlotIds(appointment.staffId, appointment.startAt, appointment.endAt)
      : [];
    const appointmentRef = this.collection().doc(appointment.id);
    if (oldIds.length === 0 && newIds.length === 0) {
      await appointmentRef.set(appointment);
      return;
    }
    await this.firebase.db.runTransaction(async (tx) => {
      const snapshots = await Promise.all(newIds.map((slotId) => tx.get(locks.doc(slotId))));
      const occupied = snapshots.find((snapshot) => snapshot.exists && snapshot.data()?.['appointmentId'] !== appointment.id);
      if (occupied) throw new AppException(ErrorCode.APPOINTMENT_CONFLICT, 'Seçilen personel bu saatte başka bir randevuda.');
      tx.set(appointmentRef, appointment);
      for (const slotId of oldIds.filter((value) => !newIds.includes(value))) tx.delete(locks.doc(slotId));
      for (const slotId of newIds) {
        tx.set(locks.doc(slotId), {
          id: slotId,
          appointmentId: appointment.id,
          branchId: appointment.branchId,
          staffId: appointment.staffId,
          startAt: appointment.startAt,
          endAt: appointment.endAt,
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  private async notifyGuestOfStatus(appointment: ApmAppointment): Promise<void> {
    if (appointment.source !== 'guest' || !appointment.branchId) return;
    try {
      const [tenantSnapshot, branchSnapshot] = await Promise.all([
        this.firebase.db.doc(`tenants/${this.tenantContext.getTenantId()}`).get(),
        this.tenantCollection(TENANT_COLLECTION.apmBranches).doc(appointment.branchId).get(),
      ]);
      await this.notifications.notifyGuest({
        ...appointment,
        tenantId: this.tenantContext.getTenantId(),
        branchId: appointment.branchId,
        branchName: String(branchSnapshot.data()?.['name'] ?? appointment.branchName ?? ''),
        serviceName: appointment.serviceName || appointment.title,
        customerName: appointment.customerName,
      }, String(tenantSnapshot.data()?.['name'] ?? 'Odivon APM'));
    } catch {
      // Status mutations must not fail because a downstream notification provider is unavailable.
    }
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
    return this.tenantCollection(TENANT_COLLECTION.apmAppointments);
  }

  private tenantCollection(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), name));
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function activeStatus(status: ApmAppointmentStatus): boolean {
  return status === 'Pending' || status === 'Confirmed' || status === 'InProgress';
}

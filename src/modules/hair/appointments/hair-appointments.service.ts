import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import {
  AppointmentStatus,
  branchHoursViolation,
  busyBlocks,
  canTransition,
  ExistingAppointment,
  findConflict,
  isOpenStatus,
  lineSpans,
  localInstant,
  Plan,
  planLines,
  ServiceSpec,
  StaffAvailability,
  staffAvailabilityViolation,
  toClock,
} from '../shared/appointment-plan';
import { hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairActor, HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz, localClockInTz, parseClock } from '../shared/hair-time';
import { fullName, live, num, str, unique } from '../shared/hair-tx';
import { AppointmentSource, SaveHairAppointmentDto, SetHairAppointmentStatusDto } from './appointment.dto';

const NOT_FOUND = 'Randevu bulunamadı.';
/** Small grace so a booking made "now" from a slow form isn't rejected as being in the past. */
const PAST_GRACE_MS = 5 * 60 * 1000;
const RANGE_LIST_LIMIT = 1000;

export interface BookingContext {
  timeZone: string;
  branch: HairDoc;
  /** Services in the requested order. */
  services: ServiceSpec[];
  serviceDocs: Map<string, HairDoc>;
  staff: Map<string, HairDoc>;
  availability: Map<string, StaffAvailability>;
}

export interface SaveOptions {
  /** Public booking: no staff actor, branch access is not checked. */
  publicRequest?: boolean;
  source?: AppointmentSource;
  /** sha256 of the public access token (online bookings). */
  publicTokenHash?: string;
}

@Injectable()
export class HairAppointmentsService {
  constructor(private readonly store: HairStore) {}

  /** Appointments with `from <= startAt < to` (UTC ISO); stylists only see their own lines. */
  async list(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const staffId = this.store.staffFilter(actor, 'hairAppointments', query.staffId);
    const branch = this.store.branchFilter(actor, query.branchId);
    const ranged = Boolean(query.from || query.to);
    return this.store.list(TENANT_COLLECTION.hairAppointments, {
      dateField: 'startAt',
      from: query.from,
      to: query.to,
      equals: { branchId: branch.equals, customerId: query.customerId, status: query.status, date: query.date },
      anyOf: branch.anyOf ? { field: 'branchId', values: branch.anyOf } : undefined,
      match: staffId ? (item) => involvesStaff(item, staffId) : undefined,
      orderBy: { field: 'startAt', dir: 'asc' },
      limit: query.limit ?? (ranged ? RANGE_LIST_LIMIT : undefined),
      cursor: query.cursor,
    });
  }

  async get(id: string) {
    const actor = await this.store.actorOrThrow();
    const item = await this.store.getOrThrow(TENANT_COLLECTION.hairAppointments, id, NOT_FOUND);
    this.assertCanSee(actor, item);
    return item;
  }

  /**
   * Creates (no id) or edits an appointment. Branch/staff hours, leave and service eligibility are
   * checked up front; the overlap check (R-001/R-002, R-012, R-013) and the write run in ONE
   * transaction that also touches a per-staff-per-day lock document, so two concurrent bookings of
   * the same slot serialise and the second one fails (R-011).
   */
  async save(dto: SaveHairAppointmentDto, id?: string, options: SaveOptions = {}) {
    const startMinutes = parseClock(dto.startTime);
    if (startMinutes === undefined) throw hairInvalid('Geçersiz başlangıç saati.');
    const actor = options.publicRequest ? null : await this.store.actorOrThrow();
    if (actor) this.store.assertBranchAccess(actor, dto.branchId);

    const existing = id ? await this.store.getOrThrow(TENANT_COLLECTION.hairAppointments, id, NOT_FOUND) : null;
    if (existing) {
      if (actor) this.assertCanSee(actor, existing);
      if (!isOpenStatus(existing['status'])) {
        throw hairPrecondition('Tamamlanan, iptal edilen veya gelinmeyen randevu düzenlenemez.'); // R-008
      }
    }

    const lineStaff = dto.services.map((line) => line.staffId ?? dto.staffId);
    const ctx = await this.loadContext(
      dto.branchId,
      dto.date,
      dto.services.map((line) => line.serviceId),
      unique([dto.staffId, ...lineStaff]),
    );
    const plan = planLines(ctx.services, lineStaff);
    const customer = await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, dto.customerId, 'Müşteri bulunamadı.');
    if (customer['active'] === false) throw hairPrecondition('Müşteri pasif durumda.');

    const startAt = localInstant(dto.date, startMinutes, ctx.timeZone);
    const endAt = new Date(startAt.getTime() + plan.totalDurationMinutes * 60_000);
    const scheduleChanged = !existing || hasScheduleChange(existing, dto, plan);
    if (scheduleChanged) {
      if (startAt.getTime() < Date.now() - PAST_GRACE_MS) {
        throw hairPrecondition('Geçmiş bir saate randevu verilemez.');
      }
      const reason = this.eligibilityViolation(ctx, dto.date, startMinutes, plan, options.publicRequest);
      if (reason) throw hairPrecondition(reason);
    }

    const primary = ctx.staff.get(dto.staffId)!;
    const settings = await this.store.settings();
    const source: AppointmentSource = options.source ?? dto.source ?? 'receptionist';
    const initialStatus: AppointmentStatus =
      source === 'online' && (!settings.autoConfirmOnlineBooking || plan.depositAmount > 0)
        ? 'pending' // R-006 / R-016
        : 'confirmed'; // R-007
    const payload = {
      customerId: dto.customerId,
      customerName: fullName(customer),
      customerPhone: str(customer['phone']),
      branchId: dto.branchId,
      staffId: dto.staffId,
      staffName: fullName(primary),
      staffColor: str(primary['color']) || undefined,
      date: dto.date,
      startTime: toClock(startMinutes),
      endTime: toClock(startMinutes + plan.totalDurationMinutes),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      totalDurationMinutes: plan.totalDurationMinutes,
      services: plan.lines,
      totalPrice: plan.totalPrice,
      depositAmount: plan.depositAmount > 0 ? plan.depositAmount : undefined,
      notes: dto.notes ?? (existing ? undefined : ''),
    };

    const userId = this.store.userId();
    const blocks = busyBlocks(startMinutes, plan.lines, dto.staffId);
    const staffIds = unique(plan.lines.map((line) => line.staffId));
    const saved = await this.store.runTransaction(async (tx) => {
      const lockRefs = staffIds.map((staffId) =>
        this.store.ref(TENANT_COLLECTION.hairStaffDayLocks, `${staffId}_${dto.date}`),
      );
      const lockSnaps = await Promise.all(lockRefs.map((ref) => tx.get(ref)));
      const ref = existing
        ? this.store.ref(TENANT_COLLECTION.hairAppointments, existing.id)
        : this.store.newRef(TENANT_COLLECTION.hairAppointments);
      const current = existing ? live(await tx.get(ref)) : null;
      if (existing && (!current || !isOpenStatus(current['status']))) {
        throw hairPrecondition('Randevu bu arada değişti; lütfen yenileyip tekrar deneyin.');
      }
      const day = await tx.get(
        this.store.collection(TENANT_COLLECTION.hairAppointments).where('date', '==', dto.date),
      );
      const others: ExistingAppointment[] = day.docs
        .filter((doc) => doc.id !== ref.id)
        .map((doc) => ({ ...doc.data(), id: doc.id }) as HairDoc)
        .filter((doc) => !isDeleted(doc))
        .map((doc) => ({
          id: doc.id,
          staffId: str(doc['staffId']),
          startTime: str(doc['startTime']),
          status: str(doc['status']),
          services: Array.isArray(doc['services']) ? (doc['services'] as ExistingAppointment['services']) : [],
        }));
      const busy = findConflict(blocks, others);
      if (busy) {
        throw hairPrecondition(`${fullName(ctx.staff.get(busy) ?? null) || 'Personel'} bu saatte başka bir randevuda.`);
      }

      const now = new Date().toISOString();
      lockRefs.forEach((lockRef, index) =>
        tx.set(lockRef, {
          staffId: staffIds[index],
          date: dto.date,
          version: num(lockSnaps[index].data()?.['version']) + 1,
          updatedAt: now,
        }),
      );
      const doc = current
        ? { ...current, ...stripUndefined(payload), updatedAt: now, updatedBy: userId }
        : {
            ...createBaseFields(ref.id, userId, now),
            ...stripUndefined(payload),
            status: initialStatus,
            source,
            reminderSent: false,
            ...(options.publicTokenHash ? { publicTokenHash: options.publicTokenHash } : {}),
          };
      tx.set(ref, doc);
      return doc as HairDoc;
    });

    await this.store.audit('hairAppointments', existing ? 'update' : 'create', saved.id, existing ? pickSchedule(existing) : null, pickSchedule(saved));
    return saved;
  }

  /** Manual status change along the allowed transitions; no-show bumps the customer's counter (R-010). */
  async setStatus(id: string, dto: SetHairAppointmentStatusDto, options: { publicRequest?: boolean } = {}) {
    if (!options.publicRequest) await this.get(id);
    const ref = this.store.ref(TENANT_COLLECTION.hairAppointments, id);
    const userId = this.store.userId();
    const result = await this.store.runTransaction(async (tx) => {
      const current = live(await tx.get(ref));
      if (!current) throw hairNotFound(NOT_FOUND);
      const from = current['status'] as AppointmentStatus;
      if (from === dto.status) return { before: current, after: current };
      if (!canTransition(from, dto.status)) {
        throw hairPrecondition(`Randevu "${from}" durumundan "${dto.status}" durumuna alınamaz.`);
      }
      const customerRef = this.store.ref(TENANT_COLLECTION.hairCustomers, str(current['customerId']));
      const customer = dto.status === 'noShow' ? live(await tx.get(customerRef)) : null;
      const now = new Date().toISOString();
      const stamps: Record<AppointmentStatus, Record<string, unknown>> = {
        checkedIn: { checkedInAt: now },
        inProgress: { startedAt: now },
        completed: { completedAt: now },
        cancelled: { cancelledAt: now, cancelReason: dto.reason ?? '' },
        noShow: { noShowAt: now },
        confirmed: { confirmedAt: now },
        pending: {},
      };
      const stamp = stamps[dto.status];
      const after = { ...current, status: dto.status, ...stamp, updatedAt: now, updatedBy: userId } as HairDoc;
      tx.set(ref, after);
      if (customer) {
        tx.update(customerRef, { noShowCount: num(customer['noShowCount']) + 1, updatedAt: now });
      }
      return { before: current, after };
    });
    if (result.before !== result.after) {
      await this.store.audit('hairAppointments', 'update', id, { status: result.before['status'] }, { status: dto.status, reason: dto.reason });
    }
    return result.after;
  }

  /** Soft-delete for erroneous records only — cancelling goes through the status endpoint (R-014). */
  async remove(id: string) {
    await this.get(id);
    return this.store.softDelete(TENANT_COLLECTION.hairAppointments, 'hairAppointments', id, NOT_FOUND);
  }

  /**
   * Free start times (`HH:mm`) on `date` for the services in order, each with the first staff member
   * who can take it. With `staffId` only that person is considered.
   */
  async availableSlots(params: {
    branchId: string;
    date: string;
    serviceIds: string[];
    staffId?: string;
    candidateStaffIds: string[];
    publicRequest?: boolean;
  }): Promise<{ time: string; staffId: string }[]> {
    const candidates = params.staffId ? [params.staffId] : params.candidateStaffIds;
    if (candidates.length === 0 || params.serviceIds.length === 0) return [];
    const ctx = await this.loadContext(params.branchId, params.date, params.serviceIds, candidates, true);
    const day = await this.store.rows(TENANT_COLLECTION.hairAppointments, { field: 'date', op: '==', value: params.date });
    const others: ExistingAppointment[] = day.map((doc) => ({
      id: doc.id,
      staffId: str(doc['staffId']),
      startTime: str(doc['startTime']),
      status: str(doc['status']),
      services: Array.isArray(doc['services']) ? (doc['services'] as ExistingAppointment['services']) : [],
    }));
    const step = Math.max(5, num(ctx.branch['slotDurationMinutes'], 15));
    const open = parseClock(str(ctx.branch['workDayStart'])) ?? 9 * 60;
    const close = parseClock(str(ctx.branch['workDayEnd'])) ?? 21 * 60;
    const today = dateIdInTz(ctx.timeZone);
    if (params.date < today) return [];
    const nowMinutes = params.date === today ? localClockInTz(new Date(), ctx.timeZone).minutes : -1;

    const slots: { time: string; staffId: string }[] = [];
    for (let start = open; start < close; start += step) {
      if (start <= nowMinutes) continue;
      for (const staffId of candidates) {
        if (!ctx.staff.has(staffId)) continue;
        let plan: Plan;
        try {
          plan = planLines(ctx.services, ctx.services.map(() => staffId));
        } catch {
          continue;
        }
        if (this.eligibilityViolation(ctx, params.date, start, plan, params.publicRequest)) continue;
        if (findConflict(busyBlocks(start, plan.lines, staffId), others)) continue;
        slots.push({ time: toClock(start), staffId });
        break;
      }
    }
    return slots;
  }

  /** Branch, services (in order), staff and their availability for one day. Missing ids → 404. */
  async loadContext(
    branchId: string,
    date: string,
    serviceIds: string[],
    staffIds: string[],
    lenient = false,
  ): Promise<BookingContext> {
    const timeZone = await this.store.timeZone();
    const branch = await this.store.getOrThrow(TENANT_COLLECTION.hairBranches, branchId, 'Şube bulunamadı.');
    if (branch['active'] === false) throw hairPrecondition('Şube aktif değil.');

    const serviceDocs = new Map<string, HairDoc>();
    for (const serviceId of unique(serviceIds)) {
      const service = await this.store.getOrThrow(TENANT_COLLECTION.hairServices, serviceId, `Hizmet bulunamadı: ${serviceId}`);
      if (service['active'] === false) throw hairPrecondition(`"${str(service['name'])}" hizmeti aktif değil.`);
      const branches = asStrings(service['branchIds']);
      if (branches.length > 0 && !branches.includes(branchId)) {
        throw hairPrecondition(`"${str(service['name'])}" bu şubede verilmiyor.`);
      }
      serviceDocs.set(serviceId, service);
    }
    const services: ServiceSpec[] = serviceIds.map((serviceId) => {
      const doc = serviceDocs.get(serviceId)!;
      return {
        id: serviceId,
        name: str(doc['name']),
        durationMinutes: num(doc['durationMinutes']),
        processingMinutes: num(doc['processingMinutes']) || undefined,
        price: num(doc['price']),
        depositAmount: num(doc['depositAmount']) || undefined,
        staffIds: asStrings(doc['staffIds']),
      };
    });

    const staff = new Map<string, HairDoc>();
    const availability = new Map<string, StaffAvailability>();
    for (const staffId of unique(staffIds)) {
      const doc = await this.store.find(TENANT_COLLECTION.hairStaff, staffId);
      if (!doc) {
        if (lenient) continue;
        throw hairNotFound('Personel bulunamadı.');
      }
      const [shifts, timeOff] = await Promise.all([
        this.store.rows(TENANT_COLLECTION.hairShifts, { field: 'staffId', op: '==', value: staffId }),
        this.store.rows(TENANT_COLLECTION.hairTimeOff, { field: 'staffId', op: '==', value: staffId }),
      ]);
      staff.set(staffId, doc);
      availability.set(staffId, {
        name: fullName(doc) || 'Personel',
        workSchedule: Array.isArray(doc['workSchedule']) ? (doc['workSchedule'] as StaffAvailability['workSchedule']) : [],
        shifts: shifts
          .filter((s) => s['date'] === date && (!s['branchId'] || s['branchId'] === branchId))
          .map((s) => ({ startTime: str(s['startTime']), endTime: str(s['endTime']) })),
        timeOff: timeOff
          .filter((t) => t['status'] === 'approved')
          .map((t) => ({ startDate: str(t['startDate']), endDate: str(t['endDate']) })),
      });
    }
    return { timeZone, branch, services, serviceDocs, staff, availability };
  }

  /** Branch hours (R-005), staff status/branch/skills and working time + leave (R-004). */
  eligibilityViolation(
    ctx: BookingContext,
    date: string,
    startMinutes: number,
    plan: Plan,
    publicRequest?: boolean,
  ): string | null {
    const branchId = ctx.branch.id;
    const hours = branchHoursViolation(date, startMinutes, startMinutes + plan.totalDurationMinutes, {
      name: str(ctx.branch['name']) || 'Şube',
      workDayStart: str(ctx.branch['workDayStart']) || undefined,
      workDayEnd: str(ctx.branch['workDayEnd']) || undefined,
      workDays: Array.isArray(ctx.branch['workDays']) ? (ctx.branch['workDays'] as number[]) : undefined,
    });
    if (hours) return hours;

    const spans = lineSpans(startMinutes, plan.lines, plan.lines[0].staffId);
    for (const staffId of unique(plan.lines.map((line) => line.staffId))) {
      const doc = ctx.staff.get(staffId);
      if (!doc) return 'Personel bulunamadı.';
      const name = fullName(doc) || 'Personel';
      if (doc['active'] === false) return `${name} aktif değil.`;
      if (publicRequest && !isOnlineBookable(doc)) return `${name} online randevuya kapalı.`;
      const branches = asStrings(doc['branchIds']);
      if (branches.length > 0 && !branches.includes(branchId)) return `${name} bu şubede çalışmıyor.`;
      const skills = asStrings(doc['serviceIds']);
      const lines = plan.lines.filter((line) => line.staffId === staffId);
      const unskilled = lines.find((line) => skills.length > 0 && !skills.includes(line.serviceId));
      if (unskilled) return `${name} "${unskilled.serviceName}" hizmetini yapamıyor.`;
      const reason = staffAvailabilityViolation(
        spans.filter((span) => span.staffId === staffId),
        date,
        ctx.availability.get(staffId)!,
      );
      if (reason) return reason;
    }
    return null;
  }

  private assertCanSee(actor: HairActor, item: HairDoc) {
    this.store.assertBranchAccess(actor, str(item['branchId']));
    if (this.store.scope(actor, 'hairAppointments') === 'own') {
      const own = this.store.staffFilter(actor, 'hairAppointments', undefined)!;
      if (!involvesStaff(item, own)) throw hairNotFound(NOT_FOUND);
    }
  }
}

export function involvesStaff(item: HairDoc, staffId: string): boolean {
  if (item['staffId'] === staffId) return true;
  return Array.isArray(item['services']) && (item['services'] as HairDoc[]).some((line) => line['staffId'] === staffId);
}

export function isOnlineBookable(staff: HairDoc): boolean {
  // Older owner cards were seeded with `onlineBookingEnabled`; treat either flag as opt-in.
  return staff['onlineBookable'] === true || staff['onlineBookingEnabled'] === true;
}

function hasScheduleChange(existing: HairDoc, dto: SaveHairAppointmentDto, plan: Plan): boolean {
  if (existing['date'] !== dto.date || existing['startTime'] !== toClock(parseClock(dto.startTime)!)) return true;
  if (existing['branchId'] !== dto.branchId || existing['staffId'] !== dto.staffId) return true;
  const before = Array.isArray(existing['services']) ? (existing['services'] as HairDoc[]) : [];
  if (before.length !== plan.lines.length) return true;
  return plan.lines.some(
    (line, i) =>
      before[i]['serviceId'] !== line.serviceId ||
      before[i]['staffId'] !== line.staffId ||
      before[i]['durationMinutes'] !== line.durationMinutes,
  );
}

function pickSchedule(doc: HairDoc) {
  return {
    date: doc['date'],
    startTime: doc['startTime'],
    staffId: doc['staffId'],
    branchId: doc['branchId'],
    customerId: doc['customerId'],
  };
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

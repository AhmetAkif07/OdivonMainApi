import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { MailService } from '../../shared/mail/mail.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { TenantService } from '../tenant/tenant.service';
import { ApmCatalogService, ApmDoc, tokenId } from './apm-catalog.service';
import { ApmGuestDeviceDto, ApmPublicBookDto } from './apm-booking.dto';
import { ApmNotificationsService } from './apm-notifications.service';
import { ApmAppointment, ApmService } from './apm.service';
import { addMinutes, clock, isoWeekday, rangesOverlap, toUtcFromLocal } from './apm-time';

const PUBLIC_USER = 'apm-public-booking';
const OTP_TTL_MS = 10 * 60_000;
const OTP_RESEND_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;
const DAILY_OTP_LIMIT = 8;
const DAILY_BOOKING_LIMIT = 5;
const ACTIVE_STATUSES = new Set(['Pending', 'Confirmed', 'InProgress']);

export interface ApmAvailableSlot {
  startTime: string;
  startAt: string;
  endAt: string;
  staffIds: string[];
}

@Injectable()
export class ApmBookingService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
    private readonly catalog: ApmCatalogService,
    private readonly apm: ApmService,
    private readonly mail: MailService,
    private readonly notifications: ApmNotificationsService,
  ) {}

  info(slug: string) {
    return this.withBranch(slug, async ({ tenant, branch }) => {
      const [services, staff, hours] = await Promise.all([
        this.catalog.services(), this.catalog.staff(), this.catalog.workingHours(),
      ]);
      return {
        tenantName: tenant.name,
        logoUrl: tenant.logoUrl ?? null,
        branch: this.publicBranch(branch),
        ready: services.some((item) => activeAtBranch(item, branch.id)) &&
          staff.some((item) => activeAtBranch(item, branch.id)) &&
          hours.some((item) => item['branchId'] === branch.id && item['enabled'] !== false),
      };
    });
  }

  services(slug: string) {
    return this.withBranch(slug, async ({ branch }) =>
      (await this.catalog.services())
        .filter((item) => activeAtBranch(item, branch.id))
        .map((item) => ({
          id: item.id,
          name: item['name'],
          description: item['description'],
          durationMinutes: item['durationMinutes'],
          color: item['color'],
        })),
    );
  }

  staff(slug: string, serviceId?: string) {
    return this.withBranch(slug, async ({ branch }) =>
      (await this.catalog.staff())
        .filter((item) => activeAtBranch(item, branch.id))
        .filter((item) => !serviceId || stringList(item['serviceIds']).includes(serviceId))
        .map((item) => ({ id: item.id, displayName: item['displayName'] })),
    );
  }

  slots(slug: string, date: string, serviceId: string, staffId?: string) {
    return this.withBranch(slug, ({ branch }) => this.availability(branch.id, date, serviceId, staffId));
  }

  async availability(branchId: string, date: string, serviceId: string, staffId?: string) {
    const [branch, service, staffRows, hours, timeOff, appointments] = await Promise.all([
      this.catalog.get(TENANT_COLLECTION.apmBranches, branchId),
      this.catalog.get(TENANT_COLLECTION.apmServices, serviceId),
      this.catalog.staff(),
      this.catalog.workingHours(),
      this.catalog.timeOff(),
      this.apm.appointments(),
    ]);
    if (!activeAtBranch(service, branchId)) notFound('Hizmet bu şubede kullanılamıyor.');
    const durationMinutes = numberValue(service['durationMinutes']);
    const timeZone = stringValue(branch['timeZone']) || 'Europe/Istanbul';
    const interval = numberValue(branch['slotIntervalMinutes']) || 15;
    const candidates = staffRows
      .filter((item) => activeAtBranch(item, branchId))
      .filter((item) => stringList(item['serviceIds']).includes(serviceId))
      .filter((item) => !staffId || item.id === staffId);
    if (!candidates.length) notFound('Bu hizmet için uygun personel bulunamadı.');
    const weekday = isoWeekday(date);
    const now = Date.now();
    const byTime = new Map<string, ApmAvailableSlot>();
    for (const member of candidates) {
      const shifts = hours.filter((item) =>
        item['branchId'] === branchId && item['staffId'] === member.id && item['weekday'] === weekday && item['enabled'] !== false,
      );
      for (const shift of shifts) {
        const shiftStart = toUtcFromLocal(date, stringValue(shift['startTime']), timeZone);
        const shiftEnd = toUtcFromLocal(date, stringValue(shift['endTime']), timeZone);
        for (let start = shiftStart; addMinutes(start, durationMinutes) <= shiftEnd; start = addMinutes(start, interval)) {
          const end = addMinutes(start, durationMinutes);
          if (start.getTime() <= now) continue;
          const startAt = start.toISOString();
          const endAt = end.toISOString();
          const unavailable = timeOff.some((item) =>
            item['branchId'] === branchId && item['staffId'] === member.id &&
            rangesOverlap(startAt, endAt, stringValue(item['startAt']), stringValue(item['endAt'])),
          ) || appointments.some((item) =>
            item.branchId === branchId && item.staffId === member.id && ACTIVE_STATUSES.has(item.status) &&
            rangesOverlap(startAt, endAt, item.startAt, item.endAt),
          );
          if (unavailable) continue;
          const startTime = clock(start, timeZone);
          const existing = byTime.get(startTime);
          if (existing) existing.staffIds.push(member.id);
          else byTime.set(startTime, { startTime, startAt, endAt, staffIds: [member.id] });
        }
      }
    }
    return {
      date,
      timeZone,
      durationMinutes,
      slots: [...byTime.values()].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    };
  }

  requestOtp(slug: string, emailInput: string, clientIp: string) {
    return this.withBranch(slug, async ({ tenant, branch }) => {
      const email = normalizeEmail(emailInput);
      await this.incrementGuard('otp', `${clientIp}:${email}`, DAILY_OTP_LIMIT);
      const ref = this.collection(TENANT_COLLECTION.apmBookingOtps).doc(tokenId(email));
      const current = await ref.get();
      const sentAt = Date.parse(stringValue(current.data()?.['sentAt']));
      if (Number.isFinite(sentAt) && Date.now() - sentAt < OTP_RESEND_MS) {
        limit(`Yeni kod için ${Math.ceil((OTP_RESEND_MS - (Date.now() - sentAt)) / 1000)} saniye bekleyin.`);
      }
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const now = new Date();
      await ref.set({
        id: ref.id,
        email,
        branchId: branch.id,
        codeHash: hash(`${email}:${code}`),
        attempts: 0,
        sentAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
      });
      const sent = await this.mail.sendApmBookingOtp(email, code, tenant.name);
      if (!sent) {
        await ref.delete();
        invalid('Doğrulama e-postası gönderilemedi. Lütfen daha sonra tekrar deneyin.');
      }
      return { sent: true, expiresInSeconds: OTP_TTL_MS / 1000, emailMasked: maskEmail(email) };
    });
  }

  book(slug: string, dto: ApmPublicBookDto, clientIp: string) {
    return this.withBranch(slug, async ({ tenant, branch }) => {
      const email = normalizeEmail(dto.email);
      await this.incrementGuard('book', `${clientIp}:${email}`, DAILY_BOOKING_LIMIT);
      await this.consumeOtp(branch.id, email, dto.otpCode);
      const availability = await this.availability(branch.id, dto.date, dto.serviceId, dto.staffId);
      const selected = availability.slots.find((slot) => slot.startTime === dto.startTime);
      if (!selected) conflict('Seçilen saat artık uygun değil. Lütfen başka bir saat seçin.');
      const staffId = dto.staffId && selected.staffIds.includes(dto.staffId) ? dto.staffId : selected.staffIds[0];
      const [service, staff] = await Promise.all([
        this.catalog.get(TENANT_COLLECTION.apmServices, dto.serviceId),
        this.catalog.get(TENANT_COLLECTION.apmStaff, staffId),
      ]);
      const token = randomBytes(32).toString('base64url');
      const appointment = await this.apm.createGuestAppointment({
        branchId: branch.id,
        branchName: stringValue(branch['name']),
        bookingSlug: stringValue(branch['slug']),
        serviceId: service.id,
        serviceName: stringValue(service['name']),
        staffId: staff.id,
        staffName: stringValue(staff['displayName']),
        durationMinutes: numberValue(service['durationMinutes']),
        startAt: selected.startAt,
        endAt: selected.endAt,
        customerName: `${dto.firstName} ${dto.lastName}`.trim(),
        customerEmail: email,
        customerPhone: dto.phone.trim(),
        notes: dto.notes?.trim() || undefined,
        bookingTokenHash: hash(token),
      });
      await Promise.all([
        this.notifications.notifyAdmins({
          ...appointment,
          tenantId: tenant.id,
          branchId: branch.id,
          branchName: stringValue(branch['name']),
          serviceName: stringValue(service['name']),
          customerName: appointment.customerName,
        }),
        this.notifications.notifyGuest({
          ...appointment,
          tenantId: tenant.id,
          branchId: branch.id,
          branchName: stringValue(branch['name']),
          serviceName: stringValue(service['name']),
          customerName: appointment.customerName,
          bookingToken: token,
        }, tenant.name),
      ]);
      return this.view(appointment, tenant.name, branch, token);
    });
  }

  getAppointment(slug: string, id: string, token: string) {
    return this.withBranch(slug, async ({ tenant, branch }) =>
      this.view(await this.authorized(branch.id, id, token), tenant.name, branch),
    );
  }

  cancel(slug: string, id: string, token: string) {
    return this.withBranch(slug, async ({ tenant, branch }) => {
      const current = await this.authorized(branch.id, id, token);
      if (!['Pending', 'Confirmed'].includes(current.status)) conflict('Bu randevu artık iptal edilemez.');
      const updated = await this.apm.setStatus(id, 'Cancelled');
      await this.notifications.notifyAdmins({
        ...updated,
        tenantId: tenant.id,
        branchId: branch.id,
        branchName: stringValue(branch['name']),
        serviceName: updated.serviceName || updated.title,
        customerName: updated.customerName,
      });
      return this.view(updated, tenant.name, branch);
    });
  }

  registerGuestDevice(slug: string, id: string, token: string, dto: ApmGuestDeviceDto) {
    return this.withBranch(slug, async ({ branch }) => {
      await this.authorized(branch.id, id, token);
      const now = new Date().toISOString();
      const deviceId = tokenId(dto.deviceToken);
      await this.collection(TENANT_COLLECTION.apmDeviceTokens).doc(deviceId).set({
        id: deviceId,
        token: dto.deviceToken,
        platform: dto.platform,
        audience: 'guest',
        appointmentId: id,
        branchId: branch.id,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }, { merge: true });
      return { registered: true };
    });
  }

  removeGuestDevice(slug: string, id: string, token: string, deviceToken: string) {
    return this.withBranch(slug, async ({ branch }) => {
      await this.authorized(branch.id, id, token);
      await this.collection(TENANT_COLLECTION.apmDeviceTokens).doc(tokenId(deviceToken)).delete();
      return { removed: true };
    });
  }

  private async withBranch<T>(slugInput: string, fn: (context: { tenant: Awaited<ReturnType<TenantService['getById']>>; branch: ApmDoc }) => Promise<T>): Promise<T> {
    const slug = slugInput.trim().toLowerCase();
    const mapping = await this.firebase.db.collection(ROOT_COLLECTION.apmPublicBranches).doc(slug).get();
    const tenantId = stringValue(mapping.data()?.['tenantId']);
    const branchId = stringValue(mapping.data()?.['branchId']);
    if (!mapping.exists || !tenantId || !branchId) notFound('İşletme bulunamadı.');
    return this.tenantContext.run(
      { tenantId, userId: PUBLIC_USER, role: 'user', modules: ['apm'], email: '' },
      async () => {
        const tenant = await this.tenants.getById(tenantId);
        if (tenant.status !== 'active' || !tenant.modules.includes('apm')) notFound('İşletme bulunamadı.');
        const branch = await this.catalog.get(TENANT_COLLECTION.apmBranches, branchId);
        if (branch['active'] === false) notFound('Şube bulunamadı.');
        return fn({ tenant, branch });
      },
    );
  }

  private async consumeOtp(branchId: string, email: string, code: string): Promise<void> {
    const ref = this.collection(TENANT_COLLECTION.apmBookingOtps).doc(tokenId(email));
    const outcome = await this.firebase.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const data = snapshot.data();
      if (!snapshot.exists || data?.['branchId'] !== branchId || Date.parse(stringValue(data?.['expiresAt'])) < Date.now()) return 'expired' as const;
      if (numberValue(data?.['attempts']) >= OTP_MAX_ATTEMPTS) return 'locked' as const;
      if (!sameHash(stringValue(data?.['codeHash']), hash(`${email}:${code}`))) {
        tx.update(ref, { attempts: numberValue(data?.['attempts']) + 1 });
        return 'wrong' as const;
      }
      tx.delete(ref);
      return 'ok' as const;
    });
    if (outcome === 'ok') return;
    const messages = { expired: 'Doğrulama kodunun süresi doldu.', locked: 'Çok fazla hatalı kod denendi.', wrong: 'Doğrulama kodu hatalı.' };
    throw new AppException(ErrorCode.OTP_INVALID, messages[outcome]);
  }

  private async incrementGuard(action: 'otp' | 'book', key: string, max: number): Promise<void> {
    const day = new Date().toISOString().slice(0, 10);
    const id = `${action}_${day}_${hash(key).slice(0, 32)}`;
    const ref = this.collection(TENANT_COLLECTION.apmBookingGuards).doc(id);
    await this.firebase.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const count = numberValue(snapshot.data()?.['count']);
      if (count >= max) limit('Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.');
      tx.set(ref, { id, action, day, count: count + 1, updatedAt: new Date().toISOString() });
    });
  }

  private async authorized(branchId: string, id: string, token: string): Promise<ApmAppointment> {
    const appointment = await this.apm.get(id);
    if (appointment.branchId !== branchId || !appointment.bookingTokenHash || !sameHash(appointment.bookingTokenHash, hash(token))) {
      notFound('Randevu bulunamadı.');
    }
    return appointment;
  }

  private view(appointment: ApmAppointment, tenantName: string, branch: ApmDoc, token?: string) {
    return {
      id: appointment.id,
      ...(token ? { token } : {}),
      tenantName,
      branchName: stringValue(branch['name']),
      serviceName: appointment.serviceName || appointment.title,
      staffName: appointment.staffName,
      customerName: appointment.customerName,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      status: appointment.status,
      notes: appointment.notes,
      canCancel: ['Pending', 'Confirmed'].includes(appointment.status),
    };
  }

  private publicBranch(branch: ApmDoc) {
    return {
      id: branch.id,
      name: branch['name'],
      slug: branch['slug'],
      address: branch['address'],
      phone: branch['phone'],
      email: branch['email'],
      timeZone: branch['timeZone'],
    };
  }

  private collection(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenantContext.getTenantId(), name));
  }
}

function activeAtBranch(doc: ApmDoc, branchId: string): boolean {
  return doc['active'] !== false && stringList(doc['branchIds']).includes(branchId);
}
function stringList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function stringValue(value: unknown): string { return typeof value === 'string' ? value : ''; }
function numberValue(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) ? value : 0; }
function normalizeEmail(value: string): string { return value.trim().toLowerCase(); }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }
function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(1, name.length - 2))}@${domain}`;
}
function invalid(message: string): never { throw new AppException(ErrorCode.APPOINTMENT_INVALID, message); }
function conflict(message: string): never { throw new AppException(ErrorCode.APPOINTMENT_CONFLICT, message); }
function notFound(message: string): never { throw new AppException(ErrorCode.APPOINTMENT_NOT_FOUND, message); }
function limit(message: string): never { throw new AppException(ErrorCode.BOOKING_LIMIT, message); }

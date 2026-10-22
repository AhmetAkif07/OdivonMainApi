import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { TenantService } from '../../tenant/tenant.service';
import { HairAppointmentsService, isOnlineBookable } from '../appointments/hair-appointments.service';
import { PUBLIC_SLUGS_COLLECTION } from '../core/hair-core.service';
import { HairCustomersService } from '../customers/hair-customers.service';
import { HairNotificationsService } from '../notifications/hair-notifications.service';
import { HairSmsService } from '../notifications/sms/hair-sms.service';
import { addDays, isOpenStatus } from '../shared/appointment-plan';
import { hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { maskPhone, normalizePhone } from '../shared/hair-phone';
import { HairDoc, HairSettingsDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { live, num, str } from '../shared/hair-tx';
import { PublicBookAppointmentDto, PublicOtpRequestDto } from './booking.dto';

/** How far ahead customers may book online. */
const MAX_DAYS_AHEAD = 90;
/** Online bookings per phone and salon day (plan §4.13 rate limit). */
const MAX_BOOKINGS_PER_PHONE_PER_DAY = 3;
/** Per client IP and salon day — on top of the per-isolate request throttle. */
const MAX_BOOKINGS_PER_IP_PER_DAY = 10;
const MAX_OTP_PER_IP_PER_DAY = 10;
const MAX_OTP_PER_PHONE_PER_DAY = 5;
const OTP_RESEND_SECONDS = 60;
const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const PUBLIC_USER = 'public-booking';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

interface SalonContext {
  tenantName: string;
  logoUrl?: string | null;
  settings: HairSettingsDoc;
  branch: HairDoc;
}

/**
 * Public online booking (plan §4.13): no auth. `:slug` is a BRANCH slug resolved through the root
 * `publicSlugs/{slug}` index; every call then runs inside that tenant's context. Appointment
 * access afterwards needs the random token returned at booking (only its sha256 is stored).
 */
@Injectable()
export class HairBookingService {
  private readonly logger = new Logger(HairBookingService.name);

  constructor(
    private readonly store: HairStore,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
    private readonly appointments: HairAppointmentsService,
    private readonly customers: HairCustomersService,
    private readonly notifications: HairNotificationsService,
    private readonly sms: HairSmsService,
  ) {}

  info(slug: string) {
    return this.withSalon(slug, false, async (salon) => ({
      tenantName: salon.tenantName,
      branchId: salon.branch.id,
      branchName: str(salon.branch['name']),
      address: str(salon.branch['address']),
      phone: str(salon.branch['phone']),
      email: str(salon.branch['email']) || undefined,
      workDayStart: str(salon.branch['workDayStart']),
      workDayEnd: str(salon.branch['workDayEnd']),
      workDays: Array.isArray(salon.branch['workDays']) ? salon.branch['workDays'] : [],
      slotDurationMinutes: num(salon.branch['slotDurationMinutes'], 15),
      logoUrl: salon.logoUrl || str(extra(salon.settings)['logoUrl']) || undefined,
      primaryColor: str(extra(salon.settings)['primaryColor']) || undefined,
      timezone: salon.settings.timezone,
      currency: salon.settings.currency,
      cancellationHoursBefore: salon.settings.cancellationHoursBefore,
      onlineBookingEnabled: salon.settings.onlineBookingEnabled,
      showPrices: salon.settings.onlineBookingShowPrices ?? true,
      onlineBookingShowPrices: salon.settings.onlineBookingShowPrices ?? true,
      requireBookingOtp: this.otpRequired(salon),
      captchaRequired: Boolean(captchaSecret()),
      maxDaysAhead: MAX_DAYS_AHEAD,
    }));
  }

  services(slug: string) {
    return this.withSalon(slug, true, async (salon) => {
      const [services, categories] = await Promise.all([
        this.bookableServices(salon.branch.id),
        this.store.rows(TENANT_COLLECTION.hairServiceCategories),
      ]);
      const categoryName = new Map(categories.map((c) => [c.id, str(c['name'])]));
      return services.map((s) => ({
        id: s.id,
        categoryId: str(s['categoryId']) || undefined,
        categoryName: categoryName.get(str(s['categoryId'])),
        name: str(s['name']),
        description: str(s['description']) || undefined,
        durationMinutes: num(s['durationMinutes']),
        price: num(s['price']),
        depositAmount: num(s['depositAmount']) || undefined,
        gender: str(s['gender']) || undefined,
      }));
    });
  }

  staff(slug: string, serviceIds: string[] = []) {
    return this.withSalon(slug, true, async (salon) =>
      (await this.bookableStaff(salon.branch.id, serviceIds)).map((s) => ({
        id: s.id,
        name: `${str(s['firstName'])} ${str(s['lastName'])}`.trim(),
        photoUrl: str(s['photoUrl']) || undefined,
        specialties: Array.isArray(s['specialties']) ? s['specialties'] : [],
        color: str(s['color']) || undefined,
      })),
    );
  }

  slots(slug: string, date: string, serviceIds: string[], staffId?: string) {
    return this.withSalon(slug, true, async (salon) => {
      this.assertBookableDate(date, salon.settings.timezone);
      const slots = await this.freeSlots(salon.branch.id, date, serviceIds, staffId);
      return slots.map((slot) => slot.time);
    });
  }

  book(slug: string, dto: PublicBookAppointmentDto, clientIp: string) {
    return this.withSalon(slug, true, async (salon) => {
      await this.verifyCaptcha(dto.captchaToken, clientIp);
      this.assertBookableDate(dto.date, salon.settings.timezone);
      const phone = normalizePhone(dto.phone);
      if (!phone) throw hairInvalid('Geçerli bir telefon numarası girin (ör. 0532 123 45 67).');
      await this.assertPhoneQuota(phone, salon.settings.timezone);
      await this.countClient('book', clientIp, salon.settings.timezone, MAX_BOOKINGS_PER_IP_PER_DAY);
      if (this.otpRequired(salon)) await this.consumeOtp(phone, dto.otpCode);

      const slots = await this.freeSlots(salon.branch.id, dto.date, dto.serviceIds, dto.staffId);
      const slot = slots.find((s) => s.time === dto.startTime);
      if (!slot) throw hairPrecondition('Seçilen saat artık müsait değil, lütfen başka bir saat seçin.');

      const customer = await this.customers.findOrCreateByPhone({
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        phone,
        email: dto.email,
      });
      const token = randomBytes(24).toString('base64url');
      const appointment = await this.appointments.save(
        {
          customerId: customer.id,
          branchId: salon.branch.id,
          staffId: slot.staffId,
          date: dto.date,
          startTime: dto.startTime,
          services: dto.serviceIds.map((serviceId) => ({ serviceId })),
          notes: dto.notes,
        },
        undefined,
        { publicRequest: true, source: 'online', publicTokenHash: hashToken(token) },
      );
      await this.notifications.notifyStaff({
        branchId: salon.branch.id,
        type: 'onlineBooking',
        title: 'Yeni online randevu',
        body: `${str(appointment['customerName'])} — ${dto.date} ${dto.startTime} (${str(appointment['staffName'])})`,
        link: `/appointments?id=${appointment.id}`,
      }); // N-004
      return this.view(appointment, salon, token);
    });
  }

  /**
   * Sends a 6-digit booking code by SMS when the salon requires it (`requireBookingOtp` and a
   * configured SMS provider); otherwise answers `{ required: false }` and sends nothing.
   */
  requestOtp(slug: string, dto: PublicOtpRequestDto, clientIp: string) {
    return this.withSalon(slug, true, async (salon) => {
      if (!this.otpRequired(salon)) return { required: false, sent: false };
      await this.verifyCaptcha(dto.captchaToken, clientIp);
      const phone = normalizePhone(dto.phone);
      if (!phone) throw hairInvalid('Geçerli bir telefon numarası girin (ör. 0532 123 45 67).');
      const timeZone = salon.settings.timezone;
      await this.countClient('otp', clientIp, timeZone, MAX_OTP_PER_IP_PER_DAY);
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const today = dateIdInTz(timeZone);
      const ref = this.store.ref(TENANT_COLLECTION.hairBookingOtps, phone);
      await this.store.runTransaction(async (tx) => {
        const current = live(await tx.get(ref));
        const sentToday = current && current['day'] === today ? num(current['sentToday']) : 0;
        const waited = current ? (Date.now() - Date.parse(str(current['sentAt']))) / 1000 : Infinity;
        if (waited < OTP_RESEND_SECONDS) {
          throw bookingLimit(`Yeni kod için ${Math.ceil(OTP_RESEND_SECONDS - waited)} saniye bekleyin.`);
        }
        if (sentToday >= MAX_OTP_PER_PHONE_PER_DAY) throw bookingLimit('Bu numaraya bugün çok fazla kod gönderildi.');
        const now = new Date();
        tx.set(ref, {
          id: phone,
          codeHash: hashToken(`${phone}:${code}`),
          attempts: 0,
          day: today,
          sentToday: sentToday + 1,
          sentAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000).toISOString(),
          deletedAt: null,
        });
      });
      const sent = await this.sms.send({
        to: phone,
        text: `${salon.tenantName} randevu doğrulama kodunuz: ${code}. Kod ${OTP_TTL_SECONDS / 60} dakika geçerlidir.`,
        type: 'bookingOtp',
        branchId: salon.branch.id,
        redact: true,
      });
      if (!sent.ok) throw hairPrecondition('Doğrulama kodu gönderilemedi, lütfen daha sonra tekrar deneyin.');
      return { required: true, sent: true, expiresInSeconds: OTP_TTL_SECONDS, phoneMasked: maskPhone(phone) };
    });
  }

  getAppointment(slug: string, id: string, token: string) {
    return this.withSalon(slug, false, async (salon) => this.view(await this.authorized(id, token, salon), salon));
  }

  /** Customer cancellation via the booking link, only until `cancellationHoursBefore` (R-009). */
  cancel(slug: string, id: string, token: string) {
    return this.withSalon(slug, false, async (salon) => {
      const appointment = await this.authorized(id, token, salon);
      if (!['pending', 'confirmed'].includes(str(appointment['status']))) {
        throw hairPrecondition('Bu randevu artık iptal edilemez.');
      }
      const hours = salon.settings.cancellationHoursBefore;
      if (Date.parse(str(appointment['startAt'])) - Date.now() < hours * 3_600_000) {
        throw hairPrecondition(`Randevuya ${hours} saatten az kaldığı için online iptal edilemez; lütfen salonu arayın.`);
      }
      const updated = await this.appointments.setStatus(
        id,
        { status: 'cancelled', reason: 'Müşteri online iptal etti' },
        { publicRequest: true },
      );
      await this.notifications.notifyStaff({
        branchId: salon.branch.id,
        type: 'onlineCancellation',
        title: 'Online randevu iptali',
        body: `${str(updated['customerName'])} — ${str(updated['date'])} ${str(updated['startTime'])}`,
        link: `/appointments?id=${id}`,
      });
      return this.view(updated, salon);
    });
  }

  // ── helpers ──

  private async withSalon<T>(slug: string, requireOnline: boolean, fn: (salon: SalonContext) => Promise<T>): Promise<T> {
    const mapping = await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(slug).get();
    const tenantId = mapping.exists ? str(mapping.data()?.['tenantId']) : '';
    const branchId = mapping.exists ? str(mapping.data()?.['branchId']) : '';
    if (!tenantId || !branchId) throw hairNotFound('Salon bulunamadı.');

    return this.tenantContext.run(
      { tenantId, userId: PUBLIC_USER, role: 'user', modules: ['hair'], email: '' },
      async () => {
        const tenant = await this.tenants.getById(tenantId).catch(() => null);
        if (!tenant || tenant.status === 'inactive' || !tenant.modules?.includes('hair')) {
          throw hairNotFound('Salon bulunamadı.');
        }
        const branch = await this.store.find(TENANT_COLLECTION.hairBranches, branchId);
        if (!branch || branch['active'] === false) throw hairNotFound('Şube bulunamadı.');
        const settings = await this.store.settings();
        if (requireOnline && !settings.onlineBookingEnabled) {
          throw hairPrecondition('Bu salon şu an online randevu almıyor.');
        }
        return fn({ tenantName: tenant.name, logoUrl: tenant.logoUrl, settings, branch });
      },
    );
  }

  private async bookableServices(branchId: string) {
    const services = await this.store.rows(TENANT_COLLECTION.hairServices);
    return services
      .filter((s) => s['active'] !== false && s['onlineBookable'] !== false)
      .filter((s) => {
        const branches = Array.isArray(s['branchIds']) ? (s['branchIds'] as string[]) : [];
        return branches.length === 0 || branches.includes(branchId);
      })
      .sort((a, b) => num(a['sortOrder']) - num(b['sortOrder']) || str(a['name']).localeCompare(str(b['name']), 'tr'));
  }

  private async bookableStaff(branchId: string, serviceIds: string[]) {
    const [staff, services] = await Promise.all([
      this.store.rows(TENANT_COLLECTION.hairStaff),
      Promise.all(serviceIds.map((id) => this.store.find(TENANT_COLLECTION.hairServices, id))),
    ]);
    return staff
      .filter((s) => s['active'] !== false && isOnlineBookable(s))
      .filter((s) => {
        const branches = Array.isArray(s['branchIds']) ? (s['branchIds'] as string[]) : [];
        const skills = Array.isArray(s['serviceIds']) ? (s['serviceIds'] as string[]) : [];
        return (
          (branches.length === 0 || branches.includes(branchId)) &&
          serviceIds.every((id) => skills.length === 0 || skills.includes(id)) &&
          services.every((service) => {
            const allowed = Array.isArray(service?.['staffIds']) ? (service!['staffIds'] as string[]) : [];
            return allowed.length === 0 || allowed.includes(s.id);
          })
        );
      })
      .sort((a, b) => str(a['firstName']).localeCompare(str(b['firstName']), 'tr'));
  }

  private async freeSlots(branchId: string, date: string, serviceIds: string[], staffId?: string) {
    const bookable = new Set((await this.bookableServices(branchId)).map((s) => s.id));
    const unknown = serviceIds.find((id) => !bookable.has(id));
    if (unknown) throw hairNotFound('Seçilen hizmet online randevuya açık değil.');
    const candidates = (await this.bookableStaff(branchId, serviceIds)).map((s) => s.id);
    if (staffId && !candidates.includes(staffId)) throw hairNotFound('Seçilen personel bu hizmetler için uygun değil.');
    return this.appointments.availableSlots({
      branchId,
      date,
      serviceIds,
      staffId,
      candidateStaffIds: candidates,
      publicRequest: true,
    });
  }

  private assertBookableDate(date: string, timeZone: string) {
    const today = dateIdInTz(timeZone);
    if (date < today) throw hairInvalid('Geçmiş bir tarih seçilemez.');
    if (date > addDays(today, MAX_DAYS_AHEAD)) {
      throw hairInvalid(`En fazla ${MAX_DAYS_AHEAD} gün sonrası için randevu alınabilir.`);
    }
  }

  /** At most MAX_BOOKINGS_PER_PHONE_PER_DAY online bookings per phone and salon day (429 BOOKING_LIMIT). */
  private async assertPhoneQuota(phone: string, timeZone: string) {
    const today = dateIdInTz(timeZone);
    const mine = await this.store.rows(TENANT_COLLECTION.hairAppointments, { field: 'customerPhone', op: '==', value: phone });
    const bookedToday = mine.filter(
      (a) => a['source'] === 'online' && str(a.createdAt) && dateIdInTz(timeZone, new Date(str(a.createdAt))) === today,
    );
    if (bookedToday.length >= MAX_BOOKINGS_PER_PHONE_PER_DAY) {
      throw bookingLimit('Bu telefon numarasıyla bugün çok fazla online randevu alındı. Lütfen salonu arayın.');
    }
  }

  /** Per-IP daily counter in Firestore (the HTTP throttle is per isolate only). */
  private async countClient(action: 'book' | 'otp', clientIp: string, timeZone: string, max: number) {
    const day = dateIdInTz(timeZone);
    const id = `${action}_${day}_${hashToken(clientIp).slice(0, 32)}`;
    const ref = this.store.ref(TENANT_COLLECTION.hairBookingGuards, id);
    await this.store.runTransaction(async (tx) => {
      const count = num((await tx.get(ref)).data()?.['count']);
      if (count >= max) throw bookingLimit('Çok fazla deneme yapıldı, lütfen daha sonra tekrar deneyin.');
      tx.set(ref, { id, action, day, count: count + 1, updatedAt: new Date().toISOString(), deletedAt: null });
    });
  }

  private otpRequired(salon: SalonContext): boolean {
    return salon.settings.requireBookingOtp === true && this.sms.isConfigured();
  }

  /** Checks and consumes the booking code; wrong codes count towards OTP_MAX_ATTEMPTS. */
  private async consumeOtp(phone: string, code: string | undefined) {
    if (!code) throw new AppException(ErrorCode.OTP_REQUIRED, 'Telefonunuza gönderilen doğrulama kodunu girin.');
    const ref = this.store.ref(TENANT_COLLECTION.hairBookingOtps, phone);
    const outcome = await this.store.runTransaction(async (tx) => {
      const current = live(await tx.get(ref));
      if (!current || str(current['expiresAt']) < new Date().toISOString()) return 'expired' as const;
      if (num(current['attempts']) >= OTP_MAX_ATTEMPTS) return 'locked' as const;
      if (!sameHash(str(current['codeHash']), hashToken(`${phone}:${code}`))) {
        tx.update(ref, { attempts: num(current['attempts']) + 1 });
        return 'wrong' as const;
      }
      tx.delete(ref);
      return 'ok' as const;
    });
    const messages = {
      expired: 'Doğrulama kodunun süresi doldu, yeni kod isteyin.',
      locked: 'Çok fazla hatalı deneme yapıldı, yeni kod isteyin.',
      wrong: 'Doğrulama kodu hatalı.',
    };
    if (outcome !== 'ok') throw new AppException(ErrorCode.OTP_INVALID, messages[outcome]);
  }

  private async authorized(id: string, token: string, salon: SalonContext): Promise<HairDoc> {
    const appointment = await this.store.find(TENANT_COLLECTION.hairAppointments, id);
    const stored = str(appointment?.['publicTokenHash']);
    if (!appointment || !stored || appointment['branchId'] !== salon.branch.id || !sameHash(stored, hashToken(token))) {
      throw hairNotFound('Randevu bulunamadı.');
    }
    return appointment;
  }

  /** Booking view for the customer — the phone number is masked. */
  private view(appointment: HairDoc, salon: SalonContext, token?: string) {
    const services = Array.isArray(appointment['services']) ? (appointment['services'] as HairDoc[]) : [];
    return {
      id: appointment.id,
      ...(token ? { token } : {}),
      status: str(appointment['status']),
      canCancel: isOpenStatus(appointment['status']) && ['pending', 'confirmed'].includes(str(appointment['status'])),
      date: str(appointment['date']),
      startTime: str(appointment['startTime']),
      endTime: str(appointment['endTime']),
      staffName: str(appointment['staffName']) || undefined,
      services: services.map((s) => ({
        serviceName: str(s['serviceName']),
        price: num(s['price']),
        durationMinutes: num(s['durationMinutes']),
      })),
      totalPrice: num(appointment['totalPrice']),
      depositAmount: num(appointment['depositAmount']) || undefined,
      customerName: str(appointment['customerName']),
      customerPhoneMasked: maskPhone(str(appointment['customerPhone'])),
      branchName: str(salon.branch['name']),
      tenantName: salon.tenantName,
    };
  }

  /**
   * Verifies a Cloudflare Turnstile token when `TURNSTILE_SECRET` (legacy: `HAIR_CAPTCHA_SECRET`) is
   * set; without a secret the check is skipped so the flow works in development. 403 CAPTCHA_FAILED.
   */
  private async verifyCaptcha(token: string | undefined, clientIp: string) {
    const secret = captchaSecret();
    if (!secret) return;
    const fail = (message: string) => new AppException(ErrorCode.CAPTCHA_FAILED, message);
    if (!token) throw fail('Doğrulama (captcha) gerekli.');
    try {
      const body = new URLSearchParams({ secret, response: token, remoteip: clientIp });
      const response = await fetch(TURNSTILE_VERIFY_URL, { method: 'POST', body });
      const result = (await response.json()) as { success?: boolean };
      if (!result.success) throw fail('Doğrulama (captcha) başarısız.');
    } catch (error) {
      if (error instanceof AppException) throw error;
      this.logger.error('Captcha verification failed', error as Error);
      throw fail('Doğrulama (captcha) yapılamadı, lütfen tekrar deneyin.');
    }
  }
}

function captchaSecret(): string | undefined {
  return process.env['TURNSTILE_SECRET'] || process.env['HAIR_CAPTCHA_SECRET'] || undefined;
}

function bookingLimit(message: string): AppException {
  return new AppException(ErrorCode.BOOKING_LIMIT, message);
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Optional branding fields some tenants keep on their settings document. */
function extra(settings: HairSettingsDoc): Record<string, unknown> {
  return settings as unknown as Record<string, unknown>;
}

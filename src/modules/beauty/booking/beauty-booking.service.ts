import { randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import {
  createBaseFields,
  isDeleted,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { TenantService } from '../../tenant/tenant.service';
import { BeautyDoc, BeautyStore } from '../shared/beauty-store';
import {
  PublicBookAppointmentDto,
  SaveBookingLinkDto,
} from './beauty-booking.dto';

export const PUBLIC_SLUGS_COLLECTION = 'publicSlugs';

const TR_MAP: Record<string, string> = {
  ç: 'c',
  Ç: 'c',
  ğ: 'g',
  Ğ: 'g',
  ı: 'i',
  İ: 'i',
  ö: 'o',
  Ö: 'o',
  ş: 's',
  Ş: 's',
  ü: 'u',
  Ü: 'u',
};

export function slugify(input: string): string {
  const lowered = input.toLowerCase();
  const ascii = Array.from(lowered)
    .map((char) => TR_MAP[char] ?? char)
    .join('')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function slugCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base;
  const suffix = `-${attempt}`;
  return `${base.slice(0, 40 - suffix.length)}${suffix}`;
}

export interface BranchData {
  id: string;
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  district?: string;
  logoUrl?: string;
  slug?: string;
  onlineBookingEnabled?: boolean;
  workDays?: number[];
  workDayStart?: string;
  workDayEnd?: string;
  timeZone?: string;
  [key: string]: unknown;
}

export interface StaffData {
  id: string;
  name?: string;
  fullName?: string;
  status?: string;
  branchId?: string;
  serviceIds?: string[];
  [key: string]: unknown;
}

export interface SalonContext {
  tenant: { id: string; name: string; logoUrl?: string | null };
  branch: BranchData;
}

@Injectable()
export class BeautyBookingService {
  constructor(
    private readonly store: BeautyStore,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
  ) {}

  async getLink(branchId?: string) {
    const branch = await this.resolveBranch(branchId);
    if (!branch) {
      return { branchId: branchId ?? '', slug: null, enabled: false };
    }
    const slug = typeof branch.slug === 'string' && branch.slug ? branch.slug : null;
    const enabled = branch.onlineBookingEnabled !== false;
    return {
      branchId: branch.id,
      slug,
      enabled,
    };
  }

  async saveLink(dto: SaveBookingLinkDto) {
    const branchSnap = await this.store.doc('beautyBranches', dto.branchId).get();
    if (!branchSnap.exists || isDeleted(branchSnap.data() as BeautyDoc)) {
      throw new NotFoundException('Şube bulunamadı.');
    }
    const rawBranch = branchSnap.data() as Record<string, unknown>;
    let branch: BranchData = { id: branchSnap.id, ...rawBranch };
    const tenantId = this.store.tenantId();
    const tenant = await this.tenants.getById(tenantId).catch(() => null);
    const tenantName = tenant?.name ?? 'salon';
    const oldSlug = typeof branch.slug === 'string' ? branch.slug : undefined;
    const patch: Record<string, unknown> = {};

    if (dto.enabled !== undefined) {
      patch['onlineBookingEnabled'] = dto.enabled;
    }

    if (dto.slug) {
      const normalizedSlug = slugify(dto.slug);
      if (!normalizedSlug || normalizedSlug.length < 3) {
        throw new BadRequestException('Geçersiz link adı. En az 3 karakter olmalıdır.');
      }
      const existing = await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(normalizedSlug).get();
      if (existing.exists) {
        const data = existing.data();
        if (data?.['tenantId'] !== tenantId || data?.['branchId'] !== dto.branchId) {
          throw new ConflictException('Bu randevu linki adı başka bir salon tarafından kullanılıyor.');
        }
      }
      if (oldSlug && oldSlug !== normalizedSlug) {
        await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(oldSlug).delete().catch(() => null);
      }
      await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(normalizedSlug).set({
        slug: normalizedSlug,
        tenantId,
        branchId: dto.branchId,
        module: 'beauty',
        updatedAt: new Date().toISOString(),
      });
      patch['slug'] = normalizedSlug;
    } else if (dto.regenerate || !oldSlug) {
      const base = slugify(tenantName || String(branch.name || 'salon')) || 'salon';
      let attempt = 1;
      let candidate = slugCandidate(base, attempt);
      while (true) {
        const snap = await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(candidate).get();
        if (!snap.exists || (snap.data()?.['tenantId'] === tenantId && snap.data()?.['branchId'] === dto.branchId)) {
          break;
        }
        attempt++;
        candidate = slugCandidate(base, attempt);
      }
      if (oldSlug && oldSlug !== candidate) {
        await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(oldSlug).delete().catch(() => null);
      }
      await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(candidate).set({
        slug: candidate,
        tenantId,
        branchId: dto.branchId,
        module: 'beauty',
        updatedAt: new Date().toISOString(),
      });
      patch['slug'] = candidate;
      if (patch['onlineBookingEnabled'] === undefined && branch.onlineBookingEnabled === undefined) {
        patch['onlineBookingEnabled'] = true;
      }
    }

    if (Object.keys(patch).length > 0) {
      await this.store.doc('beautyBranches', dto.branchId).update({
        ...patch,
        ...touchBaseFields(this.store.actor().userId),
      });
      branch = { ...branch, ...patch };
    }

    return {
      branchId: dto.branchId,
      slug: (branch.slug as string) ?? null,
      enabled: branch.onlineBookingEnabled !== false,
    };
  }

  async info(slug: string) {
    return this.withSalon(slug, false, async ({ tenant, branch }) => {
      const workDays = Array.isArray(branch.workDays) ? branch.workDays : [1, 2, 3, 4, 5, 6];
      return {
        businessName: String(tenant.name || 'Güzellik Merkezi'),
        logoUrl: (branch.logoUrl as string) || tenant.logoUrl || null,
        branchName: String(branch.name || 'Merkez Şube'),
        phone: String(branch.phone || ''),
        address: String(branch.address || ''),
        city: String(branch.city || ''),
        district: String(branch.district || ''),
        workDays,
        workDayStart: String(branch.workDayStart || '09:00'),
        workDayEnd: String(branch.workDayEnd || '19:00'),
        timeZone: String(branch.timeZone || 'Europe/Istanbul'),
        maxDaysAhead: 60,
      };
    });
  }

  async services(slug: string) {
    return this.withSalon(slug, true, async ({ branch }) => {
      const snap = await this.store.collection('beautyServices').get();
      return snap.docs
        .filter((doc) => {
          const data = doc.data() as BeautyDoc;
          if (isDeleted(data) || data['status'] === 'inactive') return false;
          if (data['branchId'] && data['branchId'] !== branch.id) return false;
          return true;
        })
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: String(data['name'] || ''),
            description: String(data['description'] || ''),
            durationMin: Number(data['durationMin'] || data['duration'] || 30),
            price: data['price'] !== undefined && data['price'] !== null ? Number(data['price']) : null,
            categoryId: String(data['categoryId'] || ''),
          };
        });
    });
  }

  async staff(slug: string, serviceId?: string) {
    return this.withSalon(slug, true, async ({ branch }) => {
      const snap = await this.store.collection('beautyStaff').where('branchId', '==', branch.id).get();
      return snap.docs
        .filter((doc) => {
          const data = doc.data() as BeautyDoc;
          if (isDeleted(data) || data['status'] === 'inactive') return false;
          if (serviceId && Array.isArray(data['serviceIds']) && data['serviceIds'].length > 0) {
            return data['serviceIds'].includes(serviceId);
          }
          return true;
        })
        .map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: String(data['fullName'] || data['name'] || 'Uzman'),
          };
        });
    });
  }

  async slots(slug: string, date: string, serviceId: string, staffId?: string) {
    return this.withSalon(slug, true, async ({ branch }) => {
      const serviceSnap = await this.store.doc('beautyServices', serviceId).get();
      const durationMin = serviceSnap.exists
        ? Number(serviceSnap.data()?.['durationMin'] || serviceSnap.data()?.['duration'] || 30)
        : 30;

      const workDayStart = String(branch.workDayStart || '09:00');
      const workDayEnd = String(branch.workDayEnd || '19:00');
      const timeZone = String(branch.timeZone || 'Europe/Istanbul');
      const workDays = Array.isArray(branch.workDays) ? branch.workDays : [1, 2, 3, 4, 5, 6];

      // Check day of week
      const dateObj = new Date(`${date}T12:00:00Z`);
      const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
      const isOpenToday = workDays.includes(dayOfWeek) || (dayOfWeek === 0 && workDays.includes(7));
      if (!isOpenToday) {
        return { date, timeZone, durationMin, slots: [] };
      }

      // Check past dates
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (date < todayStr) {
        return { date, timeZone, durationMin, slots: [] };
      }

      // Eligible staff
      const staffSnap = await this.store.collection('beautyStaff').where('branchId', '==', branch.id).get();
      const allStaff: StaffData[] = staffSnap.docs
        .filter((doc) => {
          const data = doc.data() as BeautyDoc;
          if (isDeleted(data) || data['status'] === 'inactive') return false;
          if (staffId) return doc.id === staffId;
          if (serviceId && Array.isArray(data['serviceIds']) && data['serviceIds'].length > 0) {
            return data['serviceIds'].includes(serviceId);
          }
          return true;
        })
        .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

      if (allStaff.length === 0) {
        return { date, timeZone, durationMin, slots: [] };
      }

      // Existing appointments on this date
      const apptsSnap = await this.store
        .collection('beautyAppointments')
        .where('branchId', '==', branch.id)
        .where('date', '==', date)
        .get();
      const activeAppts = apptsSnap.docs
        .filter((doc) => {
          const data = doc.data() as BeautyDoc;
          return !isDeleted(data) && data['status'] !== 'cancelled';
        })
        .map((doc) => doc.data());

      const [startH, startM] = workDayStart.split(':').map(Number);
      const [endH, endM] = workDayEnd.split(':').map(Number);
      const startTotalMin = (Number.isFinite(startH) ? startH : 9) * 60 + (Number.isFinite(startM) ? startM : 0);
      const endTotalMin = (Number.isFinite(endH) ? endH : 19) * 60 + (Number.isFinite(endM) ? endM : 0);
      const step = 30;
      const currentMinNow = date === todayStr ? now.getHours() * 60 + now.getMinutes() + 15 : -1;

      const slots: Array<{ time: string; startAt: string; endAt: string; staffIds: string[] }> = [];

      for (let cur = startTotalMin; cur + durationMin <= endTotalMin; cur += step) {
        if (cur <= currentMinNow) continue;

        const h = Math.floor(cur / 60).toString().padStart(2, '0');
        const m = (cur % 60).toString().padStart(2, '0');
        const slotTime = `${h}:${m}`;

        const endCur = cur + durationMin;
        const eH = Math.floor(endCur / 60).toString().padStart(2, '0');
        const eM = (endCur % 60).toString().padStart(2, '0');
        const slotEndTime = `${eH}:${eM}`;

        const slotStartAt = `${date}T${slotTime}:00+03:00`;
        const slotEndAt = `${date}T${slotEndTime}:00+03:00`;

        const freeStaffIds = allStaff
          .filter((member) => {
            const hasConflict = activeAppts.some((appt) => {
              if (appt['staffId'] !== member.id) return false;
              const apptStart = String(appt['startAt'] ?? '');
              const apptEnd = String(appt['endAt'] ?? '');
              return !(apptEnd <= slotStartAt || apptStart >= slotEndAt);
            });
            return !hasConflict;
          })
          .map((m) => m.id);

        if (freeStaffIds.length > 0) {
          slots.push({
            time: slotTime,
            startAt: slotStartAt,
            endAt: slotEndAt,
            staffIds: freeStaffIds,
          });
        }
      }

      return {
        date,
        timeZone,
        durationMin,
        slots,
      };
    });
  }

  async book(slug: string, dto: PublicBookAppointmentDto) {
    return this.withSalon(slug, true, async ({ tenant, branch }) => {
      const serviceSnap = await this.store.doc('beautyServices', dto.serviceId).get();
      if (!serviceSnap.exists || isDeleted(serviceSnap.data() as BeautyDoc)) {
        throw new NotFoundException('Seçilen hizmet bulunamadı.');
      }
      const service = serviceSnap.data() as Record<string, unknown>;
      const durationMin = Number(service['durationMin'] || service['duration'] || 30);

      const slotStartAt = `${dto.date}T${dto.time}:00+03:00`;
      const [h, m] = dto.time.split(':').map(Number);
      const endTotal = h * 60 + m + durationMin;
      const endH = Math.floor(endTotal / 60).toString().padStart(2, '0');
      const endM = (endTotal % 60).toString().padStart(2, '0');
      const slotEndAt = `${dto.date}T${endH}:${endM}:00+03:00`;

      // Get eligible staff
      const staffSnap = await this.store.collection('beautyStaff').where('branchId', '==', branch.id).get();
      const allStaff: StaffData[] = staffSnap.docs
        .filter((doc) => !isDeleted(doc.data() as BeautyDoc) && doc.data()['status'] !== 'inactive')
        .map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) }));

      // Fetch appointments on this date
      const apptsSnap = await this.store
        .collection('beautyAppointments')
        .where('branchId', '==', branch.id)
        .where('date', '==', dto.date)
        .get();
      const activeAppts = apptsSnap.docs
        .filter((d) => !isDeleted(d.data() as BeautyDoc) && d.data()['status'] !== 'cancelled')
        .map((d) => d.data());

      let chosenStaff: { id: string; name: string } | null = null;

      if (dto.staffId) {
        const target = allStaff.find((s) => s.id === dto.staffId);
        if (!target) throw new NotFoundException('Seçilen uzman bulunamadı.');
        const conflict = activeAppts.some((appt) => {
          if (appt['staffId'] !== target.id) return false;
          const aStart = String(appt['startAt'] ?? '');
          const aEnd = String(appt['endAt'] ?? '');
          return !(aEnd <= slotStartAt || aStart >= slotEndAt);
        });
        if (conflict) {
          throw new ConflictException('Seçilen uzmanın bu saatte başka bir randevusu bulunmaktadır.');
        }
        chosenStaff = { id: target.id, name: String(target.fullName || target.name || 'Uzman') };
      } else {
        for (const member of allStaff) {
          const conflict = activeAppts.some((appt) => {
            if (appt['staffId'] !== member.id) return false;
            const aStart = String(appt['startAt'] ?? '');
            const aEnd = String(appt['endAt'] ?? '');
            return !(aEnd <= slotStartAt || aStart >= slotEndAt);
          });
          if (!conflict) {
            chosenStaff = { id: member.id, name: String(member.fullName || member.name || 'Uzman') };
            break;
          }
        }
        if (!chosenStaff) {
          throw new ConflictException('Bu saat için uygun uzman bulunamadı.');
        }
      }

      // Customer
      let customerId = '';
      const cleanPhone = dto.phone.replace(/\D/g, '');
      const custQuery = await this.store
        .collection('beautyCustomers')
        .where('branchId', '==', branch.id)
        .where('phone', '==', dto.phone)
        .limit(1)
        .get();

      if (!custQuery.empty) {
        customerId = custQuery.docs[0].id;
      } else {
        const newCustRef = this.store.newDoc('beautyCustomers');
        customerId = newCustRef.id;
        await newCustRef.set({
          name: dto.fullName,
          phone: dto.phone,
          email: dto.email || '',
          branchId: branch.id,
          source: 'online_booking',
          status: 'active',
          ...createBaseFields(newCustRef.id, 'public:booking'),
        });
      }

      // Create appointment
      const token = randomBytes(16).toString('hex');
      const apptRef = this.store.newDoc('beautyAppointments');
      const appointmentData = {
        branchId: branch.id,
        customerId,
        customerName: dto.fullName,
        customerPhone: dto.phone,
        staffId: chosenStaff.id,
        staffName: chosenStaff.name,
        serviceIds: [dto.serviceId],
        serviceName: String(service['name'] || 'Hizmet'),
        date: dto.date,
        startTime: dto.time,
        startAt: slotStartAt,
        endAt: slotEndAt,
        durationMinutes: durationMin,
        status: 'pending',
        notes: dto.notes || '',
        source: 'online_booking',
        cancelToken: token,
        kvkkConsent: dto.kvkkConsent,
        ...createBaseFields(apptRef.id, 'public:booking'),
      };
      await apptRef.set(appointmentData);

      return {
        id: apptRef.id,
        token,
        businessName: String(tenant.name || 'Güzellik Merkezi'),
        branchName: String(branch.name || 'Merkez Şube'),
        branchPhone: String(branch.phone || ''),
        serviceName: String(service['name'] || 'Hizmet'),
        staffName: chosenStaff.name,
        customerName: dto.fullName,
        startAt: slotStartAt,
        endAt: slotEndAt,
        timeZone: String(branch.timeZone || 'Europe/Istanbul'),
        status: 'pending',
        canCancel: true,
      };
    });
  }

  async getAppointment(slug: string, id: string, token: string) {
    return this.withSalon(slug, false, async ({ tenant, branch }) => {
      const apptSnap = await this.store.doc('beautyAppointments', id).get();
      if (!apptSnap.exists || isDeleted(apptSnap.data() as BeautyDoc)) {
        throw new NotFoundException('Randevu bulunamadı.');
      }
      const appt = apptSnap.data() as Record<string, unknown>;
      if (appt['cancelToken'] !== token) {
        throw new NotFoundException('Randevu bulunamadı veya erişim yetkiniz yok.');
      }
      const status = String(appt['status'] || 'pending');
      return {
        id: apptSnap.id,
        token,
        businessName: String(tenant.name || 'Güzellik Merkezi'),
        branchName: String(branch.name || 'Merkez Şube'),
        branchPhone: String(branch.phone || ''),
        serviceName: String(appt['serviceName'] || 'Hizmet'),
        staffName: String(appt['staffName'] || 'Uzman'),
        customerName: String(appt['customerName'] || ''),
        startAt: String(appt['startAt'] || ''),
        endAt: String(appt['endAt'] || ''),
        timeZone: String(branch.timeZone || 'Europe/Istanbul'),
        status,
        canCancel: status === 'pending' || status === 'confirmed',
      };
    });
  }

  async cancelAppointment(slug: string, id: string, token: string) {
    return this.withSalon(slug, false, async ({ tenant, branch }) => {
      const apptSnap = await this.store.doc('beautyAppointments', id).get();
      if (!apptSnap.exists || isDeleted(apptSnap.data() as BeautyDoc)) {
        throw new NotFoundException('Randevu bulunamadı.');
      }
      const appt = apptSnap.data() as Record<string, unknown>;
      if (appt['cancelToken'] !== token) {
        throw new NotFoundException('Randevu bulunamadı veya erişim yetkiniz yok.');
      }
      const currentStatus = String(appt['status'] || 'pending');
      if (currentStatus === 'cancelled') {
        throw new BadRequestException('Bu randevu zaten iptal edilmiş.');
      }

      await this.store.doc('beautyAppointments', id).update({
        status: 'cancelled',
        cancelledAt: new Date().toISOString(),
        cancellationReason: 'Müşteri online iptal etti',
        ...touchBaseFields('public:booking'),
      });

      return {
        id: apptSnap.id,
        token,
        businessName: String(tenant.name || 'Güzellik Merkezi'),
        branchName: String(branch.name || 'Merkez Şube'),
        branchPhone: String(branch.phone || ''),
        serviceName: String(appt['serviceName'] || 'Hizmet'),
        staffName: String(appt['staffName'] || 'Uzman'),
        customerName: String(appt['customerName'] || ''),
        startAt: String(appt['startAt'] || ''),
        endAt: String(appt['endAt'] || ''),
        timeZone: String(branch.timeZone || 'Europe/Istanbul'),
        status: 'cancelled',
        canCancel: false,
      };
    });
  }

  private async resolveBranch(branchId?: string): Promise<BranchData | null> {
    if (branchId) {
      const snap = await this.store.doc('beautyBranches', branchId).get();
      if (snap.exists && !isDeleted(snap.data() as BeautyDoc)) {
        return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
      }
      return null;
    }
    const snap = await this.store.collection('beautyBranches').limit(1).get();
    const doc = snap.docs.find((d) => !isDeleted(d.data() as BeautyDoc));
    return doc ? { id: doc.id, ...(doc.data() as Record<string, unknown>) } : null;
  }

  private async withSalon<T>(
    slug: string,
    requireOnline: boolean,
    fn: (salon: SalonContext) => Promise<T>,
  ): Promise<T> {
    const mapping = await this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(slug).get();
    if (!mapping.exists) {
      throw new NotFoundException('Salon bulunamadı.');
    }
    const mappingData = mapping.data();
    const tenantId = String(mappingData?.['tenantId'] ?? '');
    const branchId = String(mappingData?.['branchId'] ?? '');
    if (!tenantId || !branchId) {
      throw new NotFoundException('Salon bulunamadı.');
    }

    return this.tenantContext.run(
      { tenantId, userId: 'public-booking', role: 'user', modules: ['beauty'], email: '' },
      async () => {
        const tenant = await this.tenants.getById(tenantId).catch(() => null);
        if (!tenant || tenant.status === 'inactive') {
          throw new NotFoundException('Salon bulunamadı.');
        }
        const branchSnap = await this.store.db.doc(`tenants/${tenantId}/beautyBranches/${branchId}`).get();
        if (!branchSnap.exists || isDeleted(branchSnap.data() as BeautyDoc)) {
          throw new NotFoundException('Şube bulunamadı.');
        }
        const branch: BranchData = { id: branchSnap.id, ...(branchSnap.data() as Record<string, unknown>) };
        if (requireOnline && branch.onlineBookingEnabled === false) {
          throw new PreconditionFailedException('Bu salon şu an online randevu kabul etmemektedir.');
        }
        return fn({
          tenant: { id: tenant.id, name: tenant.name, logoUrl: tenant.logoUrl },
          branch,
        });
      },
    );
  }
}

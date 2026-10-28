import { createHash, randomInt, randomUUID } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { createBaseFields } from '../../shared/firestore/base-document';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { MailService } from '../../shared/mail/mail.service';
import { CreatePublicBookingDto, PublicAvailabilityQueryDto } from './rentacar.dto';
import { calculateQuote } from './rentacar-pricing';
import { assertNoReservationConflict, rangesOverlap, reservationDayKeys } from './reservation-slots';
import { RentRatePlan, RentReservation, RentVehicle, SlotEntry } from './rentacar.types';

@Injectable()
export class RentacarPublicService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
  ) {}

  async catalog(slug: string) {
    const tenantId = await this.resolveTenant(slug);
    const [tenant, settings, branches, vehicles, rates] = await Promise.all([
      this.firebase.db.doc(`tenants/${tenantId}`).get(),
      this.doc(tenantId, TENANT_COLLECTION.rentSettings, 'main').get(),
      this.col(tenantId, TENANT_COLLECTION.rentBranches).get(),
      this.col(tenantId, TENANT_COLLECTION.rentVehicles).get(),
      this.col(tenantId, TENANT_COLLECTION.rentRatePlans).get(),
    ]);
    const settingsData = settings.data();
    if (!settingsData?.publicBookingEnabled) throw new AppException(ErrorCode.RENT_NOT_FOUND, 'Online rezervasyon sayfası aktif değil.');
    return {
      company: tenant.data()?.name ?? 'Rent A Car',
      slug,
      depositPercent: Number(settingsData.depositPercent ?? 20),
      privacyNotice: String(settingsData.privacyNotice ?? ''),
      branches: branches.docs.map((item) => item.data()).filter((item) => !item.deletedAt && item.active),
      vehicles: vehicles.docs.map((item) => item.data()).filter((item) => !item.deletedAt && item.status === 'available')
        .map((item) => ({ id: item.id, branchId: item.branchId, brand: item.brand, model: item.model, modelYear: item.modelYear, segment: item.segment, fuelType: item.fuelType, dailyPrice: item.dailyPrice })),
      rates: rates.docs.map((item) => item.data()).filter((item) => !item.deletedAt && item.active)
        .map((item) => ({ id: item.id, branchId: item.branchId, name: item.name, vehicleSegment: item.vehicleSegment, taxRate: item.taxRate, tiers: item.tiers })),
    };
  }

  async availability(slug: string, query: PublicAvailabilityQueryDto) {
    const tenantId = await this.resolveTenant(slug);
    const vehicleSnapshot = await this.col(tenantId, TENANT_COLLECTION.rentVehicles).where('branchId', '==', query.branchId).get();
    const vehicles = vehicleSnapshot.docs.map((doc) => doc.data() as RentVehicle)
      .filter((vehicle) => !vehicle.deletedAt && vehicle.status === 'available');
    const available: RentVehicle[] = [];
    for (const vehicle of vehicles) {
      const keys = reservationDayKeys(vehicle.id, query.pickupAt, query.returnAt);
      const snapshots = await this.firebase.db.getAll(...keys.map((key) => this.doc(tenantId, TENANT_COLLECTION.rentReservationSlots, key)));
      const busy = snapshots.some((snapshot) => ((snapshot.data()?.entries ?? []) as SlotEntry[])
        .some((entry) => rangesOverlap(entry.startAt, entry.endAt, query.pickupAt, query.returnAt)));
      if (!busy) available.push(vehicle);
    }
    return available.map((vehicle) => ({
      id: vehicle.id, brand: vehicle.brand, model: vehicle.model, modelYear: vehicle.modelYear,
      segment: vehicle.segment, fuelType: vehicle.fuelType, dailyPrice: vehicle.dailyPrice,
    }));
  }

  async requestOtp(slug: string, email: string) {
    const tenantId = await this.resolveTenant(slug);
    const tenant = await this.firebase.db.doc(`tenants/${tenantId}`).get();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const id = randomUUID();
    const now = new Date();
    await this.firebase.db.collection(ROOT_COLLECTION.rentPublicOtps).doc(id).create({
      id, tenantId, email: email.trim().toLowerCase(), codeHash: otpHash(id, code),
      expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(), attempts: 0,
      verifiedAt: null, verificationTokenHash: null, createdAt: now.toISOString(),
    });
    const sent = await this.mail.sendRentacarOtp(email, code, tenant.data()?.name ?? 'Rent A Car');
    if (!sent) throw new ServiceUnavailableException('Doğrulama e-postası şu anda gönderilemiyor.');
    return { id, expiresInSeconds: 600 };
  }

  async verifyOtp(slug: string, id: string, code: string) {
    const tenantId = await this.resolveTenant(slug);
    const ref = this.firebase.db.collection(ROOT_COLLECTION.rentPublicOtps).doc(id);
    const token = randomUUID();
    await this.firebase.db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const otp = snapshot.data();
      if (!otp || otp.tenantId !== tenantId || otp.verifiedAt || Date.parse(otp.expiresAt) < Date.now() || Number(otp.attempts) >= 5) {
        throw new AppException(ErrorCode.RENT_FORBIDDEN, 'Doğrulama kodu geçersiz veya süresi dolmuş.');
      }
      if (otp.codeHash !== otpHash(id, code)) {
        tx.update(ref, { attempts: Number(otp.attempts) + 1 });
        throw new AppException(ErrorCode.RENT_FORBIDDEN, 'Doğrulama kodu hatalı.');
      }
      tx.update(ref, { verifiedAt: new Date().toISOString(), verificationTokenHash: tokenHash(token) });
    });
    return { verificationId: id, verificationToken: token };
  }

  async createBooking(slug: string, dto: CreatePublicBookingDto) {
    if (!dto.privacyAccepted) throw new AppException(ErrorCode.RENT_INVALID, 'Aydınlatma metni onayı zorunludur.');
    const tenantId = await this.resolveTenant(slug);
    const [settingsSnapshot, vehicleSnapshot, planSnapshot] = await Promise.all([
      this.doc(tenantId, TENANT_COLLECTION.rentSettings, 'main').get(),
      this.doc(tenantId, TENANT_COLLECTION.rentVehicles, dto.vehicleId).get(),
      this.doc(tenantId, TENANT_COLLECTION.rentRatePlans, dto.ratePlanId).get(),
    ]);
    const settings = settingsSnapshot.data();
    const vehicle = vehicleSnapshot.data() as RentVehicle | undefined;
    const plan = planSnapshot.data() as RentRatePlan | undefined;
    if (!settings?.publicBookingEnabled || !vehicle || vehicle.deletedAt || !plan || plan.deletedAt || !plan.active) {
      throw new AppException(ErrorCode.RENT_NOT_FOUND, 'Araç veya tarife bulunamadı.');
    }
    if (vehicle.branchId !== dto.branchId || plan.branchId !== dto.branchId || vehicle.segment !== plan.vehicleSegment) {
      throw new AppException(ErrorCode.RENT_INVALID, 'Araç, şube ve tarife eşleşmiyor.');
    }
    const price = calculateQuote({ ...dto, tiers: plan.tiers, taxRate: plan.taxRate });
    const now = new Date().toISOString();
    const customerId = randomUUID();
    const reservationId = randomUUID();
    const reservation: RentReservation = {
      ...createBaseFields(reservationId, 'public:booking', now), id: reservationId, tenantId,
      branchId: dto.branchId, returnBranchId: dto.returnBranchId, vehicleId: dto.vehicleId,
      customerId, pickupAt: dto.pickupAt, returnAt: dto.returnAt,
      status: Number(settings.depositPercent ?? 20) > 0 ? 'pending_payment' : 'confirmed',
      ratePlanId: dto.ratePlanId, extraIds: dto.extraIds ?? [], note: null, price, version: 1,
    };
    const otpRef = this.firebase.db.collection(ROOT_COLLECTION.rentPublicOtps).doc(dto.verificationId);
    const slotKeys = reservationDayKeys(dto.vehicleId, dto.pickupAt, dto.returnAt);
    const slotRefs = slotKeys.map((key) => this.doc(tenantId, TENANT_COLLECTION.rentReservationSlots, key));
    await this.firebase.db.runTransaction(async (tx) => {
      const otpSnapshot = await tx.get(otpRef);
      const slotSnapshots = await tx.getAll(...slotRefs);
      const otp = otpSnapshot.data();
      if (!otp || otp.tenantId !== tenantId || !otp.verifiedAt || otp.usedAt || otp.verificationTokenHash !== tokenHash(dto.verificationToken) || otp.email !== dto.customer.email.trim().toLowerCase()) {
        throw new AppException(ErrorCode.RENT_FORBIDDEN, 'Rezervasyon doğrulaması geçersiz.');
      }
      const candidate = { reservationId, startAt: dto.pickupAt, endAt: dto.returnAt };
      slotSnapshots.forEach((snapshot, index) => {
        const entries = (snapshot.data()?.entries ?? []) as SlotEntry[];
        assertNoReservationConflict(entries, candidate);
        tx.set(slotRefs[index], { id: slotKeys[index], vehicleId: dto.vehicleId, day: slotKeys[index].slice(slotKeys[index].lastIndexOf('_') + 1), entries: [...entries, candidate], updatedAt: now });
      });
      tx.create(this.doc(tenantId, TENANT_COLLECTION.rentCustomers, customerId), {
        ...createBaseFields(customerId, 'public:booking', now), id: customerId, tenantId,
        branchId: dto.branchId, kind: 'individual', firstName: dto.customer.firstName,
        lastName: dto.customer.lastName, companyName: null, identityNumber: dto.customer.identityNumber ?? null,
        taxNumber: null, email: dto.customer.email.trim().toLowerCase(), phone: dto.customer.phone,
        address: null, driverLicenseNumber: null, driverLicenseClass: null, driverLicenseExpiresAt: null,
        tags: ['online-rezervasyon'], blacklisted: false, blacklistReason: null,
      });
      tx.create(this.doc(tenantId, TENANT_COLLECTION.rentCustomerConsents, randomUUID()), {
        customerId, privacyAccepted: true, marketingAccepted: dto.marketingAccepted ?? false,
        source: 'public_portal', acceptedAt: now,
      });
      tx.create(this.doc(tenantId, TENANT_COLLECTION.rentReservations, reservationId), reservation);
      tx.update(otpRef, { usedAt: now });
    });
    const depositPercent = Number(settings.depositPercent ?? 20);
    return {
      id: reservationId, status: reservation.status, price,
      paymentRequiredAmount: Math.round(price.totalAmount * depositPercent) / 100,
    };
  }

  private async resolveTenant(slug: string): Promise<string> {
    if (!/^[a-z0-9-]{3,60}$/.test(slug)) throw new AppException(ErrorCode.RENT_NOT_FOUND, 'Rezervasyon sayfası bulunamadı.');
    const snapshot = await this.firebase.db.collection(ROOT_COLLECTION.rentPublicTenants).doc(slug).get();
    const data = snapshot.data();
    if (!data?.tenantId || !data.active) throw new AppException(ErrorCode.RENT_NOT_FOUND, 'Rezervasyon sayfası bulunamadı.');
    return String(data.tenantId);
  }

  private col(tenantId: string, name: string) { return this.firebase.db.collection(tenantCollectionPath(tenantId, name)); }
  private doc(tenantId: string, name: string, id: string) { return this.col(tenantId, name).doc(id); }
}

function otpHash(id: string, code: string): string {
  return createHash('sha256').update(`${id}:${code}:${otpSecret()}`).digest('hex');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function otpSecret(): string {
  const secret = process.env.RENT_OTP_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') throw new ServiceUnavailableException('Rezervasyon doğrulama servisi yapılandırılmamış.');
  return 'odivon-rentacar-local-development';
}

import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { createBaseFields, omitUndefined, touchBaseFields } from '../../shared/firestore/base-document';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  CheckoutRentalDto, CreateBranchDto, CreateCustomerDto, CreateRatePlanDto,
  CreateRelatedRecordDto, CreateReservationDto, CreateTransactionDto, CreateVehicleDto,
  ListRentQueryDto, QuoteDto, RefundTransactionDto, RentSettingsDto,
  RescheduleReservationDto, ReservationStatusDto, ReturnRentalDto,
  UpdateBranchDto, UpdateCustomerDto, UpdateRatePlanDto, UpdateRelatedRecordDto, UpdateVehicleDto,
} from './rentacar.dto';
import { calculateQuote } from './rentacar-pricing';
import { assertNoReservationConflict, reservationDayKeys } from './reservation-slots';
import {
  RentBranch, RentCustomer, RentRatePlan, RentRental, RentReservation,
  RentTransaction, RentVehicle, SlotEntry,
} from './rentacar.types';

type RentCollection =
  | typeof TENANT_COLLECTION.rentBranches
  | typeof TENANT_COLLECTION.rentVehicles
  | typeof TENANT_COLLECTION.rentCustomers
  | typeof TENANT_COLLECTION.rentRatePlans
  | typeof TENANT_COLLECTION.rentReservations
  | typeof TENANT_COLLECTION.rentRentals
  | typeof TENANT_COLLECTION.rentTransactions
  | typeof TENANT_COLLECTION.rentMaintenanceOrders
  | typeof TENANT_COLLECTION.rentDamages
  | typeof TENANT_COLLECTION.rentCrmTasks
  | typeof TENANT_COLLECTION.rentCommunicationLogs
  | typeof TENANT_COLLECTION.rentCampaigns
  | typeof TENANT_COLLECTION.rentTransfers;

export interface RentDocument {
  id: string;
  tenantId: string;
  branchId?: string;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class RentacarService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
  ) {}

  async me() {
    const current = this.tenant.getStore();
    const settings = await this.getSettings();
    const branches = await this.list<RentBranch>(TENANT_COLLECTION.rentBranches, {});
    return {
      tenantId: current.tenantId,
      userId: current.userId,
      role: current.role,
      branchIds: current.branchIds ?? [],
      allBranches: current.allBranches === true,
      settings,
      branches: branches.items,
    };
  }

  async dashboard(branchId?: string) {
    const [vehicles, reservations, rentals, transactions] = await Promise.all([
      this.list<RentVehicle>(TENANT_COLLECTION.rentVehicles, { branchId, limit: 500 }),
      this.list<RentReservation>(TENANT_COLLECTION.rentReservations, { branchId, limit: 500 }),
      this.list<RentRental>(TENANT_COLLECTION.rentRentals, { branchId, limit: 500 }),
      this.list<RentTransaction>(TENANT_COLLECTION.rentTransactions, { branchId, limit: 500 }),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const active = vehicles.items.filter((item) => item.status !== 'inactive');
    const todayRevenue = transactions.items
      .filter((item) => item.createdAt.startsWith(today) && ['payment', 'deposit'].includes(item.kind))
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return {
      vehicles: active.length,
      available: active.filter((item) => item.status === 'available').length,
      rented: active.filter((item) => item.status === 'rented').length,
      maintenance: active.filter((item) => item.status === 'maintenance').length,
      upcomingReservations: reservations.items.filter((item) => ['confirmed', 'pending_payment'].includes(item.status)).length,
      overdueRentals: rentals.items.filter((item) => item.status === 'checked_out' && Date.parse(item.expectedReturnAt) < Date.now()).length,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      utilizationRate: active.length ? Math.round(active.filter((item) => item.status === 'rented').length / active.length * 10_000) / 100 : 0,
    };
  }

  branches(query: ListRentQueryDto) { return this.list<RentBranch>(TENANT_COLLECTION.rentBranches, query); }
  createBranch(dto: CreateBranchDto) {
    return this.create<RentBranch>(TENANT_COLLECTION.rentBranches, {
      ...dto, code: dto.code.toUpperCase(), phone: dto.phone ?? null, address: dto.address ?? null,
      timezone: 'Europe/Istanbul', active: dto.active ?? true,
    });
  }
  updateBranch(id: string, dto: UpdateBranchDto) { return this.update<RentBranch>(TENANT_COLLECTION.rentBranches, id, dto); }

  vehicles(query: ListRentQueryDto) { return this.list<RentVehicle>(TENANT_COLLECTION.rentVehicles, query); }
  createVehicle(dto: CreateVehicleDto) {
    this.assertBranch(dto.branchId);
    return this.create<RentVehicle>(TENANT_COLLECTION.rentVehicles, {
      ...dto, plate: normalizePlate(dto.plate), status: dto.status ?? 'available', mileage: dto.mileage ?? 0,
      fuelType: dto.fuelType ?? 'Benzin', fuelCapacity: dto.fuelCapacity ?? null,
      chassisNumber: dto.chassisNumber ?? null, engineNumber: dto.engineNumber ?? null,
      maintenanceMileage: dto.maintenanceMileage ?? null, dailyPrice: dto.dailyPrice ?? 0,
    });
  }
  updateVehicle(id: string, dto: UpdateVehicleDto) {
    if (dto.branchId) this.assertBranch(dto.branchId);
    return this.update<RentVehicle>(TENANT_COLLECTION.rentVehicles, id, {
      ...dto, ...(dto.plate ? { plate: normalizePlate(dto.plate) } : {}),
    });
  }

  customers(query: ListRentQueryDto) { return this.list<RentCustomer>(TENANT_COLLECTION.rentCustomers, query); }
  createCustomer(dto: CreateCustomerDto) {
    this.assertBranch(dto.branchId);
    return this.create<RentCustomer>(TENANT_COLLECTION.rentCustomers, {
      ...dto, kind: dto.kind ?? 'individual', companyName: dto.companyName ?? null,
      identityNumber: dto.identityNumber ?? null, taxNumber: dto.taxNumber ?? null,
      address: dto.address ?? null, driverLicenseNumber: dto.driverLicenseNumber ?? null,
      driverLicenseClass: dto.driverLicenseClass ?? null, driverLicenseExpiresAt: dto.driverLicenseExpiresAt ?? null,
      tags: dto.tags ?? [], blacklisted: dto.blacklisted ?? false, blacklistReason: dto.blacklistReason ?? null,
    });
  }
  updateCustomer(id: string, dto: UpdateCustomerDto) {
    if (dto.branchId) this.assertBranch(dto.branchId);
    return this.update<RentCustomer>(TENANT_COLLECTION.rentCustomers, id, dto);
  }

  ratePlans(query: ListRentQueryDto) { return this.list<RentRatePlan>(TENANT_COLLECTION.rentRatePlans, query); }
  createRatePlan(dto: CreateRatePlanDto) {
    this.assertBranch(dto.branchId);
    assertDateOrder(dto.validFrom, dto.validTo);
    return this.create<RentRatePlan>(TENANT_COLLECTION.rentRatePlans, {
      ...dto, currency: 'TRY', taxRate: dto.taxRate ?? 20,
      tiers: dto.tiers.map((tier) => ({ ...tier, maxDays: tier.maxDays ?? null })), active: dto.active ?? true,
    });
  }
  updateRatePlan(id: string, dto: UpdateRatePlanDto) {
    if (dto.branchId) this.assertBranch(dto.branchId);
    if (dto.validFrom && dto.validTo) assertDateOrder(dto.validFrom, dto.validTo);
    const update: Partial<RentRatePlan> = {
      ...dto,
      tiers: dto.tiers?.map((tier) => ({ ...tier, maxDays: tier.maxDays ?? null })),
    };
    return this.update<RentRatePlan>(TENANT_COLLECTION.rentRatePlans, id, update);
  }

  async quote(dto: QuoteDto) {
    const plan = await this.get<RentRatePlan>(TENANT_COLLECTION.rentRatePlans, dto.ratePlanId);
    this.assertBranch(plan.branchId);
    if (!plan.active || dto.pickupAt.slice(0, 10) < plan.validFrom.slice(0, 10) || dto.pickupAt.slice(0, 10) > plan.validTo.slice(0, 10)) {
      throw new AppException(ErrorCode.RENT_INVALID, 'Tarife seçilen tarihlerde aktif değil.');
    }
    return calculateQuote({ ...dto, tiers: plan.tiers, taxRate: plan.taxRate });
  }

  reservations(query: ListRentQueryDto) { return this.list<RentReservation>(TENANT_COLLECTION.rentReservations, query); }

  async createReservation(dto: CreateReservationDto) {
    this.assertBranch(dto.branchId);
    this.assertBranch(dto.returnBranchId);
    const [vehicle, customer, price] = await Promise.all([
      this.get<RentVehicle>(TENANT_COLLECTION.rentVehicles, dto.vehicleId),
      this.get<RentCustomer>(TENANT_COLLECTION.rentCustomers, dto.customerId),
      this.quote(dto),
    ]);
    this.assertBranch(vehicle.branchId);
    this.assertBranch(customer.branchId);
    if (vehicle.status === 'inactive' || vehicle.status === 'out_of_service' || vehicle.status === 'maintenance') {
      throw new AppException(ErrorCode.RENT_INVALID, 'Araç rezervasyona uygun durumda değil.');
    }
    const now = new Date().toISOString();
    const id = randomUUID();
    const reservation: RentReservation = {
      ...createBaseFields(id, this.tenant.getUserId(), now), id, tenantId: this.tenant.getTenantId(),
      branchId: dto.branchId, returnBranchId: dto.returnBranchId, vehicleId: dto.vehicleId,
      customerId: dto.customerId, pickupAt: dto.pickupAt, returnAt: dto.returnAt,
      status: dto.status ?? 'confirmed', ratePlanId: dto.ratePlanId, extraIds: dto.extraIds ?? [],
      note: dto.note ?? null, price, version: 1,
    };
    await this.firebase.db.runTransaction(async (tx) => {
      await this.writeReservationSlots(tx, null, reservation);
      tx.create(this.ref(TENANT_COLLECTION.rentReservations, id), reservation);
    });
    await this.audit('RENT_RESERVATION_CREATED', 'reservation', id, { branchId: dto.branchId, vehicleId: dto.vehicleId });
    return reservation;
  }

  async rescheduleReservation(id: string, dto: RescheduleReservationDto) {
    const current = await this.get<RentReservation>(TENANT_COLLECTION.rentReservations, id);
    this.assertBranch(current.branchId);
    if (current.version !== dto.version) throw new AppException(ErrorCode.RENT_CONFLICT, 'Rezervasyon başka bir kullanıcı tarafından güncellendi.');
    if (['cancelled', 'converted', 'no_show'].includes(current.status)) throw new AppException(ErrorCode.INVALID_STATUS, 'Bu rezervasyon yeniden planlanamaz.');
    const nextBranch = dto.branchId ?? current.branchId;
    const nextReturnBranch = dto.returnBranchId ?? current.returnBranchId;
    this.assertBranch(nextBranch); this.assertBranch(nextReturnBranch);
    const discountBase = current.price.baseAmount + current.price.extrasAmount + current.price.oneWayFee;
    const price = await this.quote({
      ...dto,
      extrasAmount: dto.extrasAmount ?? current.price.extrasAmount,
      oneWayFee: dto.oneWayFee ?? current.price.oneWayFee,
      discountPercent: dto.discountPercent ?? (discountBase > 0 ? (current.price.discountAmount / discountBase) * 100 : 0),
    });
    const next: RentReservation = {
      ...current, ...omitUndefined(dto), branchId: nextBranch, returnBranchId: nextReturnBranch,
      vehicleId: dto.vehicleId ?? current.vehicleId, extraIds: dto.extraIds ?? current.extraIds,
      note: dto.note ?? current.note, price, version: current.version + 1,
      ...touchBaseFields(this.tenant.getUserId()),
    };
    await this.firebase.db.runTransaction(async (tx) => {
      const latest = (await tx.get(this.ref(TENANT_COLLECTION.rentReservations, id))).data() as RentReservation | undefined;
      if (!latest || latest.version !== dto.version) throw new AppException(ErrorCode.RENT_CONFLICT, 'Rezervasyon başka bir kullanıcı tarafından güncellendi.');
      await this.writeReservationSlots(tx, current, next);
      tx.set(this.ref(TENANT_COLLECTION.rentReservations, id), next);
    });
    await this.audit('RENT_RESERVATION_RESCHEDULED', 'reservation', id, { pickupAt: next.pickupAt, returnAt: next.returnAt });
    return next;
  }

  async setReservationStatus(id: string, dto: ReservationStatusDto) {
    const current = await this.get<RentReservation>(TENANT_COLLECTION.rentReservations, id);
    this.assertBranch(current.branchId);
    if (current.version !== dto.version) throw new AppException(ErrorCode.RENT_CONFLICT, 'Rezervasyon başka bir kullanıcı tarafından güncellendi.');
    const allowed: Record<string, string[]> = {
      draft: ['pending_payment', 'confirmed', 'cancelled'], pending_payment: ['confirmed', 'cancelled'],
      confirmed: ['cancelled', 'no_show', 'converted'], cancelled: [], no_show: [], converted: [],
    };
    if (!allowed[current.status]?.includes(dto.status)) throw new AppException(ErrorCode.INVALID_STATUS, 'Geçersiz rezervasyon durum geçişi.');
    const next = { ...current, status: dto.status, version: current.version + 1, ...touchBaseFields(this.tenant.getUserId()) };
    await this.firebase.db.runTransaction(async (tx) => {
      const latest = (await tx.get(this.ref(TENANT_COLLECTION.rentReservations, id))).data() as RentReservation | undefined;
      if (!latest || latest.version !== dto.version) throw new AppException(ErrorCode.RENT_CONFLICT, 'Rezervasyon başka bir kullanıcı tarafından güncellendi.');
      if (['cancelled', 'no_show'].includes(dto.status)) await this.writeReservationSlots(tx, current, null);
      tx.set(this.ref(TENANT_COLLECTION.rentReservations, id), next);
    });
    await this.audit('RENT_RESERVATION_STATUS', 'reservation', id, { from: current.status, to: dto.status });
    return next;
  }

  async schedule(from: string, to: string, branchId?: string) {
    assertDateOrder(from, to);
    const [vehicles, reservations, blocks] = await Promise.all([
      this.list<RentVehicle>(TENANT_COLLECTION.rentVehicles, { branchId, limit: 500 }),
      this.list<RentReservation>(TENANT_COLLECTION.rentReservations, { branchId, limit: 500 }),
      this.list<RentDocument>(TENANT_COLLECTION.rentMaintenanceOrders, { branchId, limit: 500 }),
    ]);
    return {
      from, to, vehicles: vehicles.items,
      items: [
        ...reservations.items.filter((item) => item.status !== 'cancelled' && Date.parse(item.pickupAt) < Date.parse(to) && Date.parse(item.returnAt) > Date.parse(from))
          .map((item) => ({
            id: item.id,
            vehicleId: item.vehicleId,
            type: 'reservation',
            startAt: item.pickupAt,
            endAt: item.returnAt,
            status: item.status,
            label: item.customerId,
            ratePlanId: item.ratePlanId,
            version: item.version,
          })),
        ...blocks.items.map((item) => item as RentDocument & Record<string, unknown>)
          .filter((item) => typeof item['startAt'] === 'string' && typeof item['endAt'] === 'string' && Date.parse(String(item['startAt'])) < Date.parse(to) && Date.parse(String(item['endAt'])) > Date.parse(from))
          .map((item) => ({ id: item.id, vehicleId: item['vehicleId'], type: 'maintenance', startAt: item['startAt'], endAt: item['endAt'], status: item['status'], label: item['title'] })),
      ],
    };
  }

  rentals(query: ListRentQueryDto) { return this.list<RentRental>(TENANT_COLLECTION.rentRentals, query); }

  async convertReservation(id: string) {
    const reservation = await this.get<RentReservation>(TENANT_COLLECTION.rentReservations, id);
    this.assertBranch(reservation.branchId);
    if (reservation.status !== 'confirmed') throw new AppException(ErrorCode.INVALID_STATUS, 'Yalnız onaylı rezervasyon kiralamaya dönüştürülebilir.');
    const rentalId = randomUUID();
    const now = new Date().toISOString();
    const rental: RentRental = {
      ...createBaseFields(rentalId, this.tenant.getUserId(), now), id: rentalId, tenantId: this.tenant.getTenantId(),
      branchId: reservation.branchId, reservationId: reservation.id,
      contractNumber: `ODV-${now.slice(0, 10).replace(/-/g, '')}-${rentalId.slice(0, 6).toUpperCase()}`,
      vehicleId: reservation.vehicleId, customerId: reservation.customerId,
      pickupAt: reservation.pickupAt, expectedReturnAt: reservation.returnAt, returnedAt: null,
      checkoutMileage: null, returnMileage: null, checkoutFuelPercent: null, returnFuelPercent: null,
      status: 'draft', price: reservation.price, version: 1,
    };
    await this.firebase.db.runTransaction(async (tx) => {
      const latest = (await tx.get(this.ref(TENANT_COLLECTION.rentReservations, id))).data() as RentReservation | undefined;
      if (!latest || latest.status !== 'confirmed') throw new AppException(ErrorCode.RENT_CONFLICT, 'Rezervasyon durumu değişti.');
      tx.create(this.ref(TENANT_COLLECTION.rentRentals, rentalId), rental);
      tx.update(this.ref(TENANT_COLLECTION.rentReservations, id), { status: 'converted', version: latest.version + 1, ...touchBaseFields(this.tenant.getUserId(), now) });
    });
    await this.audit('RENT_RENTAL_CREATED', 'rental', rentalId, { reservationId: id });
    return rental;
  }

  async checkoutRental(id: string, dto: CheckoutRentalDto) {
    const rental = await this.get<RentRental>(TENANT_COLLECTION.rentRentals, id);
    this.assertBranch(rental.branchId);
    if (rental.status !== 'draft') throw new AppException(ErrorCode.INVALID_STATUS, 'Kiralama teslim edilmeye uygun değil.');
    const now = new Date().toISOString();
    await this.firebase.db.runTransaction(async (tx) => {
      tx.update(this.ref(TENANT_COLLECTION.rentRentals, id), {
        status: 'checked_out', checkoutMileage: dto.mileage ?? null,
        checkoutFuelPercent: dto.fuelPercent ?? null, version: rental.version + 1,
        ...touchBaseFields(this.tenant.getUserId(), now),
      });
      tx.update(this.ref(TENANT_COLLECTION.rentVehicles, rental.vehicleId), {
        status: 'rented', ...(dto.mileage !== undefined ? { mileage: dto.mileage } : {}),
        ...touchBaseFields(this.tenant.getUserId(), now),
      });
    });
    return this.get<RentRental>(TENANT_COLLECTION.rentRentals, id);
  }

  async returnRental(id: string, dto: ReturnRentalDto) {
    const rental = await this.get<RentRental>(TENANT_COLLECTION.rentRentals, id);
    this.assertBranch(rental.branchId);
    if (!['checked_out', 'overdue'].includes(rental.status)) throw new AppException(ErrorCode.INVALID_STATUS, 'Kiralama iade alınmaya uygun değil.');
    const now = new Date().toISOString();
    const nextVehicleStatus = dto.nextVehicleStatus ?? 'cleaning';
    await this.firebase.db.runTransaction(async (tx) => {
      tx.update(this.ref(TENANT_COLLECTION.rentRentals, id), {
        status: 'returned', returnedAt: now, returnMileage: dto.mileage ?? null,
        returnFuelPercent: dto.fuelPercent ?? null, version: rental.version + 1,
        ...touchBaseFields(this.tenant.getUserId(), now),
      });
      tx.update(this.ref(TENANT_COLLECTION.rentVehicles, rental.vehicleId), {
        status: nextVehicleStatus, ...(dto.mileage !== undefined ? { mileage: dto.mileage } : {}),
        ...touchBaseFields(this.tenant.getUserId(), now),
      });
    });
    return this.get<RentRental>(TENANT_COLLECTION.rentRentals, id);
  }

  transactions(query: ListRentQueryDto) { return this.list<RentTransaction>(TENANT_COLLECTION.rentTransactions, query); }
  createTransaction(dto: CreateTransactionDto) {
    this.assertBranch(dto.branchId);
    return this.create<RentTransaction>(TENANT_COLLECTION.rentTransactions, {
      ...dto, customerId: dto.customerId ?? null, reservationId: dto.reservationId ?? null,
      rentalId: dto.rentalId ?? null, currency: 'TRY', note: dto.note ?? null, reversedTransactionId: null,
    });
  }

  async refundTransaction(id: string, dto: RefundTransactionDto) {
    const original = await this.get<RentTransaction>(TENANT_COLLECTION.rentTransactions, id);
    this.assertBranch(original.branchId);
    if (!['payment', 'deposit'].includes(original.kind) || dto.amount > original.amount) {
      throw new AppException(ErrorCode.FINANCE_INVALID, 'İade tutarı ve kaynak işlem uygun değil.');
    }
    return this.create<RentTransaction>(TENANT_COLLECTION.rentTransactions, {
      branchId: original.branchId, customerId: original.customerId, reservationId: original.reservationId,
      rentalId: original.rentalId, kind: 'refund', method: original.method, amount: -dto.amount,
      currency: 'TRY', note: dto.reason, reversedTransactionId: original.id,
    });
  }

  related(collection: RentCollection, query: ListRentQueryDto) { return this.list<RentDocument>(collection, query); }
  createRelated(collection: RentCollection, dto: CreateRelatedRecordDto) {
    this.assertBranch(dto.branchId);
    return this.create<RentDocument>(collection, { branchId: dto.branchId, ...sanitizeRecord(dto.data) });
  }
  updateRelated(collection: RentCollection, id: string, dto: UpdateRelatedRecordDto) {
    return this.update<RentDocument>(collection, id, sanitizeRecord(dto.data));
  }
  remove(collection: RentCollection, id: string) { return this.softDelete(collection, id); }

  async getSettings() {
    const snapshot = await this.firebase.db.doc(`${tenantCollectionPath(this.tenant.getTenantId(), TENANT_COLLECTION.rentSettings)}/main`).get();
    return snapshot.exists ? snapshot.data() : null;
  }

  async saveSettings(dto: RentSettingsDto) {
    const tenantId = this.tenant.getTenantId();
    const now = new Date().toISOString();
    const settingsRef = this.firebase.db.doc(`${tenantCollectionPath(tenantId, TENANT_COLLECTION.rentSettings)}/main`);
    const indexRef = this.firebase.db.collection(ROOT_COLLECTION.rentPublicTenants).doc(dto.publicSlug);
    await this.firebase.db.runTransaction(async (tx) => {
      const currentIndex = await tx.get(indexRef);
      if (currentIndex.exists && currentIndex.data()?.tenantId !== tenantId) {
        throw new AppException(ErrorCode.RENT_CONFLICT, 'Bu public rezervasyon adresi kullanımda.');
      }
      const current = (await tx.get(settingsRef)).data();
      const previousSlug = current?.publicSlug as string | undefined;
      tx.set(settingsRef, {
        ...(current ?? { tenantId, ...createBaseFields('main', this.tenant.getUserId(), now) }),
        ...dto, publicBookingEnabled: dto.publicBookingEnabled ?? false,
        depositPercent: dto.depositPercent ?? 20, defaultTaxRate: dto.defaultTaxRate ?? 20,
        privacyNotice: dto.privacyNotice ?? '', ...touchBaseFields(this.tenant.getUserId(), now),
      });
      tx.set(indexRef, { tenantId, active: dto.publicBookingEnabled ?? false, updatedAt: now });
      if (previousSlug && previousSlug !== dto.publicSlug) tx.delete(this.firebase.db.collection(ROOT_COLLECTION.rentPublicTenants).doc(previousSlug));
    });
    return this.getSettings();
  }

  private async list<T extends RentDocument>(collection: RentCollection, query: ListRentQueryDto): Promise<{ items: T[]; total: number }> {
    if (query.branchId) this.assertBranch(query.branchId);
    const snapshot = await this.collection(collection).limit(Math.min(query.limit ?? 100, 500)).get();
    const search = query.search?.trim().toLocaleLowerCase('tr') ?? '';
    const items = snapshot.docs
      .map((doc) => doc.data() as T)
      .filter((item) => !item.deletedAt)
      .filter((item) => this.canAccessBranch(item.branchId))
      .filter((item) => !query.branchId || item.branchId === query.branchId)
      .filter((item) => !search || JSON.stringify(item).toLocaleLowerCase('tr').includes(search))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return { items, total: items.length };
  }

  private async get<T extends RentDocument>(collection: RentCollection, id: string): Promise<T> {
    const snapshot = await this.ref(collection, id).get();
    const item = snapshot.data() as T | undefined;
    if (!item || item.deletedAt) throw new AppException(ErrorCode.RENT_NOT_FOUND, 'Kayıt bulunamadı.');
    if (!this.canAccessBranch(item.branchId)) throw new AppException(ErrorCode.RENT_FORBIDDEN, 'Bu şubenin kaydına erişemezsiniz.');
    return item;
  }

  private async create<T extends RentDocument>(collection: RentCollection, fields: Omit<Partial<T>, keyof ReturnType<typeof createBaseFields> | 'id' | 'tenantId'>): Promise<T> {
    const ref = this.collection(collection).doc();
    const item = {
      ...createBaseFields(ref.id, this.tenant.getUserId()), id: ref.id,
      tenantId: this.tenant.getTenantId(), ...fields,
    } as unknown as T;
    await ref.create(item);
    await this.audit('RENT_RECORD_CREATED', collection, ref.id, { branchId: item.branchId ?? null });
    return item;
  }

  private async update<T extends RentDocument>(collection: RentCollection, id: string, fields: Partial<T>): Promise<T> {
    const current = await this.get<T>(collection, id);
    if (fields.branchId) this.assertBranch(fields.branchId);
    const patch = { ...omitUndefined(fields), id: undefined, tenantId: undefined, createdAt: undefined, createdBy: undefined, ...touchBaseFields(this.tenant.getUserId()) };
    const clean = sanitizeRecord(patch as Record<string, unknown>);
    await this.ref(collection, id).update(clean);
    await this.audit('RENT_RECORD_UPDATED', collection, id, clean);
    return { ...current, ...clean } as T;
  }

  private async softDelete(collection: RentCollection, id: string) {
    const current = await this.get<RentDocument>(collection, id);
    const now = new Date().toISOString();
    await this.ref(collection, id).update({ deletedAt: now, ...touchBaseFields(this.tenant.getUserId(), now) });
    await this.audit('RENT_RECORD_DELETED', collection, id, { branchId: current.branchId ?? null });
    return { id };
  }

  private async writeReservationSlots(tx: Transaction, previous: RentReservation | null, next: RentReservation | null) {
    const previousKeys = previous ? reservationDayKeys(previous.vehicleId, previous.pickupAt, previous.returnAt) : [];
    const nextKeys = next ? reservationDayKeys(next.vehicleId, next.pickupAt, next.returnAt) : [];
    const keys = [...new Set([...previousKeys, ...nextKeys])];
    const refs = keys.map((key) => this.ref(TENANT_COLLECTION.rentReservationSlots, key));
    const snapshots = refs.length ? await tx.getAll(...refs) : [];
    const candidate = next ? { reservationId: next.id, startAt: next.pickupAt, endAt: next.returnAt } : null;
    snapshots.forEach((snapshot, index) => {
      const entries = ((snapshot.data()?.entries ?? []) as SlotEntry[]).filter((entry) => entry.reservationId !== (previous?.id ?? next?.id));
      const key = keys[index];
      if (candidate && nextKeys.includes(key)) {
        assertNoReservationConflict(entries, candidate);
        entries.push(candidate);
      }
      if (entries.length) tx.set(refs[index], { id: key, vehicleId: key.slice(0, key.lastIndexOf('_')), day: key.slice(key.lastIndexOf('_') + 1), entries, updatedAt: new Date().toISOString() });
      else if (snapshot.exists) tx.delete(refs[index]);
    });
  }

  private assertBranch(branchId: string) {
    if (!this.canAccessBranch(branchId)) throw new AppException(ErrorCode.RENT_FORBIDDEN, 'Bu şube için yetkiniz yok.');
  }

  private canAccessBranch(branchId?: string): boolean {
    const current = this.tenant.getStore();
    return !branchId || current.role === 'owner' || current.allBranches === true || (current.branchIds ?? []).includes(branchId);
  }

  private collection(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), name));
  }

  private ref(name: string, id: string): DocumentReference {
    return this.collection(name).doc(id);
  }

  private async audit(action: string, entity: string, entityId: string, changes: Record<string, unknown>) {
    const ref = this.collection(TENANT_COLLECTION.rentAuditLogs).doc();
    await ref.set({ id: ref.id, action, entity, entityId, changes, userId: this.tenant.getUserId(), timestamp: new Date().toISOString() });
  }
}

function normalizePlate(value: string): string {
  return value.toLocaleUpperCase('tr').replace(/\s+/g, ' ').trim();
}

function assertDateOrder(start: string, end: string) {
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || Date.parse(end) <= Date.parse(start)) {
    throw new AppException(ErrorCode.RENT_INVALID, 'Bitiş tarihi başlangıç tarihinden sonra olmalıdır.');
  }
}

function sanitizeRecord(input: Record<string, unknown>): Record<string, unknown> {
  const forbidden = new Set(['tenantId', 'createdAt', 'createdBy', 'deletedAt']);
  return Object.fromEntries(Object.entries(input).filter(([key, value]) => !forbidden.has(key) && value !== undefined));
}

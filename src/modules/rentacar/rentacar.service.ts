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
  | typeof TENANT_COLLECTION.rentTransfers
  | typeof TENANT_COLLECTION.rentInvoices
  | typeof TENANT_COLLECTION.rentExtras
  | typeof TENANT_COLLECTION.rentDiscountRules;

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

  invoices(query: ListRentQueryDto) {
    return this.list<RentDocument>(TENANT_COLLECTION.rentInvoices, query);
  }

  async fromRental(rentalId: string) {
    const rental = await this.get<RentRental>(TENANT_COLLECTION.rentRentals, rentalId);
    this.assertBranch(rental.branchId);
    const customer = rental.customerId ? await this.get<RentCustomer>(TENANT_COLLECTION.rentCustomers, rental.customerId).catch(() => null) : null;
    const now = new Date().toISOString();
    const invoiceNumber = `INV-${Date.now().toString().slice(-6)}`;
    const totalAmount = (rental as any).totalPrice ?? (rental as any).price?.totalAmount ?? 0;
    const taxRate = 0.20;
    const netAmount = Math.round((totalAmount / (1 + taxRate)) * 100) / 100;
    const taxAmount = Math.round((totalAmount - netAmount) * 100) / 100;

    const invoiceData = {
      branchId: rental.branchId,
      rentalId: rental.id,
      customerId: rental.customerId,
      number: invoiceNumber,
      type: (customer as any)?.type === 'corporate' ? 'e_invoice' : 'e_archive',
      status: 'issued',
      issuedAt: now,
      netAmount,
      taxAmount,
      totalAmount,
      currency: (rental as any).price?.currency ?? 'TRY',
      customerName: customer ? (customer.companyName || `${customer.firstName} ${customer.lastName}`) : 'Müşteri',
    };

    const invoice = await this.create<RentDocument>(TENANT_COLLECTION.rentInvoices, invoiceData as any);
    await this.update<RentRental>(TENANT_COLLECTION.rentRentals, rentalId, { invoiced: true } as any);
    return invoice;
  }

  async cancelInvoice(id: string, reason: string) {
    return this.update<RentDocument>(TENANT_COLLECTION.rentInvoices, id, {
      status: 'cancelled',
      cancelReason: reason || 'İptal edildi',
      cancelledAt: new Date().toISOString(),
    } as any);
  }

  async reports(type: string, query: { from?: string; to?: string; branchId?: string }) {
    const branchId = query.branchId || undefined;
    if (branchId) this.assertBranch(branchId);

    const [
      vehiclesRes,
      rentalsRes,
      customersRes,
      branchesRes,
      reservationsRes,
      transactionsRes,
      maintenancesRes,
      damagesRes,
    ] = await Promise.all([
      this.list<RentVehicle>(TENANT_COLLECTION.rentVehicles, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
      this.list<RentRental>(TENANT_COLLECTION.rentRentals, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
      this.list<RentCustomer>(TENANT_COLLECTION.rentCustomers, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
      this.list<RentBranch>(TENANT_COLLECTION.rentBranches, {}).catch(() => ({ items: [], total: 0 })),
      this.list<RentReservation>(TENANT_COLLECTION.rentReservations, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
      this.list<RentTransaction>(TENANT_COLLECTION.rentTransactions, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
      this.list<RentDocument>(TENANT_COLLECTION.rentMaintenanceOrders, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
      this.list<RentDocument>(TENANT_COLLECTION.rentDamages, { branchId, limit: 500 }).catch(() => ({ items: [], total: 0 })),
    ]);

    const vehicles = vehiclesRes.items;
    const rentals = rentalsRes.items;
    const customers = customersRes.items;
    const branches = branchesRes.items;
    const reservations = reservationsRes.items;
    const transactions = transactionsRes.items;
    const maintenances = maintenancesRes.items;
    const damages = damagesRes.items;

    // Helper for period range overlap
    const fromMs = query.from ? Date.parse(query.from) : null;
    const toMs = query.to ? Date.parse(query.to) : null;

    const isDateInPeriod = (dateStr?: string | null): boolean => {
      if (!dateStr) return true;
      const ms = Date.parse(dateStr);
      if (isNaN(ms)) return true;
      if (fromMs !== null && ms < fromMs) return false;
      if (toMs !== null && ms > toMs) return false;
      return true;
    };

    switch (type) {
      case 'utilization': {
        const activeVehicles = vehicles.filter((v) => !v.deletedAt && v.status !== 'inactive' && v.status !== 'out_of_service');
        const segments = Array.from(new Set(activeVehicles.map((v) => v.segment || 'Ekonomik')));

        const windowDays = Math.max(1, fromMs && toMs ? Math.round((toMs - fromMs) / (86400 * 1000)) : 30);
        const nonCancelledRentals = rentals.filter((r) => r.status !== 'cancelled' && r.status !== 'draft');

        const rows = segments.map((seg) => {
          const segVehicles = activeVehicles.filter((v) => (v.segment || 'Ekonomik').toLowerCase() === seg.toLowerCase());
          const totalVehicles = segVehicles.length;
          const availableVehicles = segVehicles.filter((v) => v.status === 'available').length;
          const segVehicleIds = new Set(segVehicles.map((v) => v.id));
          const segRentals = nonCancelledRentals.filter((r) => segVehicleIds.has(r.vehicleId));

          let rentedDays = 0;
          for (const r of segRentals) {
            const pStart = Date.parse(r.pickupAt || r.createdAt);
            const pEnd = Date.parse(r.returnedAt || r.expectedReturnAt || r.pickupAt || r.createdAt);
            if (isNaN(pStart) || isNaN(pEnd)) continue;
            const startOverlap = fromMs !== null ? Math.max(fromMs, pStart) : pStart;
            const endOverlap = toMs !== null ? Math.min(toMs, pEnd) : pEnd;
            if (endOverlap > startOverlap) {
              rentedDays += Math.max(1, Math.round((endOverlap - startOverlap) / (86400 * 1000)));
            }
          }

          const totalDays = totalVehicles * windowDays;
          const rate = totalDays > 0 ? Math.min(1, Math.round((rentedDays / totalDays) * 100) / 100) : 0;
          return { segment: seg, totalVehicles, availableVehicles, rentedDays, totalDays, rate };
        });

        const totalVeh = rows.reduce((s, r) => s + r.totalVehicles, 0);
        const totalRented = rows.reduce((s, r) => s + r.rentedDays, 0);
        const totalCapacity = rows.reduce((s, r) => s + r.totalDays, 0);
        const avgRate = totalCapacity > 0 ? Math.min(1, Math.round((totalRented / totalCapacity) * 100) / 100) : 0;

        return {
          columns: [
            { key: 'segment', label: 'Segment', type: 'text' },
            { key: 'totalVehicles', label: 'Toplam Araç', type: 'number' },
            { key: 'availableVehicles', label: 'Müsait Araç', type: 'number' },
            { key: 'rentedDays', label: 'Kiralanan Gün', type: 'number' },
            { key: 'rate', label: 'Doluluk Oranı', type: 'percent' },
          ],
          rows,
          summary: { totalVehicles: totalVeh, rentedDays: totalRented, rate: avgRate },
        };
      }

      case 'revenue': {
        const nonCancelledRentals = rentals.filter((r) => r.status !== 'cancelled' && r.status !== 'draft' && isDateInPeriod(r.pickupAt || r.createdAt));
        const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        const groupMap = new Map<string, { period: string; rentalRevenue: number; extrasRevenue: number; finesRevenue: number; totalRevenue: number }>();

        for (const r of nonCancelledRentals) {
          const d = new Date(r.pickupAt || r.createdAt);
          const key = isNaN(d.getTime()) ? 'Dönem' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const periodLabel = isNaN(d.getTime()) ? 'Genel Dönem' : `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
          const existing = groupMap.get(key) ?? { period: periodLabel, rentalRevenue: 0, extrasRevenue: 0, finesRevenue: 0, totalRevenue: 0 };

          const base = Number(r.price?.baseAmount ?? r.price?.netAmount ?? 0);
          const extras = Number(r.price?.extrasAmount ?? 0);
          const fines = Number(r.price?.oneWayFee ?? 0);
          const total = Number(r.price?.totalAmount ?? (base + extras + fines));

          existing.rentalRevenue += base;
          existing.extrasRevenue += extras;
          existing.finesRevenue += fines;
          existing.totalRevenue += total;
          groupMap.set(key, existing);
        }

        const rows = Array.from(groupMap.entries())
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([, val]) => val);

        return {
          columns: [
            { key: 'period', label: 'Dönem', type: 'text' },
            { key: 'rentalRevenue', label: 'Kira Geliri', type: 'money' },
            { key: 'extrasRevenue', label: 'Ek Hizmet Geliri', type: 'money' },
            { key: 'finesRevenue', label: 'Ekstra Ücretler', type: 'money' },
            { key: 'totalRevenue', label: 'Toplam Ciro', type: 'money' },
          ],
          rows,
          summary: {
            totalRevenue: rows.reduce((s, r) => s + r.totalRevenue, 0),
            rentalRevenue: rows.reduce((s, r) => s + r.rentalRevenue, 0),
            extrasRevenue: rows.reduce((s, r) => s + r.extrasRevenue, 0),
          },
        };
      }

      case 'vehicle-profitability': {
        const nonCancelledRentals = rentals.filter((r) => r.status !== 'cancelled' && r.status !== 'draft');

        const rows = vehicles.map((v) => {
          const vRentals = nonCancelledRentals
            .filter((r) => r.vehicleId === v.id && isDateInPeriod(r.pickupAt || r.createdAt));

          const income = vRentals.reduce((sum, r) => sum + (Number(r.price?.totalAmount) || 0), 0);

          const vMaints = maintenances.filter((m: any) => m.vehicleId === v.id && !m.deletedAt && isDateInPeriod(m.createdAt || m.date));
          const vDams = damages.filter((d: any) => d.vehicleId === v.id && !d.deletedAt && isDateInPeriod(d.createdAt || d.incidentDate));

          const maintCost = vMaints.reduce((sum, m: any) => sum + (Number(m.totalCost || m.cost) || 0), 0);
          const damCost = vDams.reduce((sum, d: any) => sum + (Number(d.estimatedCost || d.cost) || 0), 0);
          const expense = maintCost + damCost;
          const net = income - expense;
          const margin = income > 0 ? Math.round((net / income) * 100) / 100 : (expense > 0 ? -1 : 0);

          return {
            plate: v.plate,
            vehicle: `${v.brand} ${v.model}`.trim(),
            income,
            expense,
            net,
            margin,
          };
        }).sort((a, b) => b.income - a.income);

        return {
          columns: [
            { key: 'plate', label: 'Plaka', type: 'text' },
            { key: 'vehicle', label: 'Araç', type: 'text' },
            { key: 'income', label: 'Toplam Gelir', type: 'money' },
            { key: 'expense', label: 'Masraflar', type: 'money' },
            { key: 'net', label: 'Net Kâr', type: 'money' },
            { key: 'margin', label: 'Kâr Marjı', type: 'percent' },
          ],
          rows,
          summary: {
            income: rows.reduce((s, r) => s + r.income, 0),
            expense: rows.reduce((s, r) => s + r.expense, 0),
            net: rows.reduce((s, r) => s + r.net, 0),
          },
        };
      }

      case 'branch-performance': {
        const nonCancelledRentals = rentals.filter((r) => r.status !== 'cancelled' && r.status !== 'draft' && isDateInPeriod(r.pickupAt || r.createdAt));

        const targetBranches = branchId ? branches.filter((b) => b.id === branchId) : branches;

        const rows = targetBranches.map((b) => {
          const bRentals = nonCancelledRentals.filter((r) => r.branchId === b.id);
          const rentalsCount = bRentals.length;
          const revenue = bRentals.reduce((sum, r) => sum + (Number(r.price?.totalAmount) || 0), 0);
          const totalDays = bRentals.reduce((sum, r) => sum + (Number(r.price?.rentalDays) || 1), 0);
          const avgDays = rentalsCount > 0 ? Math.round((totalDays / rentalsCount) * 10) / 10 : 0;

          const bVehicles = vehicles.filter((v) => v.branchId === b.id && !v.deletedAt);
          const bRented = bVehicles.filter((v) => v.status === 'rented').length;
          const utilization = bVehicles.length > 0 ? Math.round((bRented / bVehicles.length) * 100) / 100 : 0;

          return {
            branch: b.name || 'Şube',
            rentalsCount,
            revenue,
            avgDays,
            utilization,
          };
        }).sort((a, b) => b.revenue - a.revenue);

        return {
          columns: [
            { key: 'branch', label: 'Şube', type: 'text' },
            { key: 'rentalsCount', label: 'Kiralama Adedi', type: 'number' },
            { key: 'revenue', label: 'Şube Cirosu', type: 'money' },
            { key: 'avgDays', label: 'Ort. Gün', type: 'number' },
            { key: 'utilization', label: 'Doluluk Oranı', type: 'percent' },
          ],
          rows,
          summary: {
            revenue: rows.reduce((s, r) => s + r.revenue, 0),
            rentalsCount: rows.reduce((s, r) => s + r.rentalsCount, 0),
          },
        };
      }

      case 'collections': {
        const nonCancelledRentals = rentals.filter((r) => r.status !== 'cancelled' && isDateInPeriod(r.pickupAt || r.createdAt));

        const customerMap = new Map(customers.map((c) => [c.id, c]));

        const rows = nonCancelledRentals.map((r) => {
          const cust = customerMap.get(r.customerId);
          const customerName = cust ? (cust.companyName || `${cust.firstName} ${cust.lastName}`.trim()) : 'Müşteri';
          const totalAmount = Number(r.price?.totalAmount) || 0;

          const rTx = transactions.filter((t) => t.rentalId === r.id && !t.reversedTransactionId);
          const paidTx = rTx
            .filter((t) => t.kind === 'payment' || (t as any).kind === 'charge')
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

          const paidAmount = (r.price as any)?.paidAmount ?? (paidTx > 0 ? paidTx : (r.status === 'closed' ? totalAmount : 0));
          const open = Math.max(0, totalAmount - paidAmount);
          const collectionRate = totalAmount > 0 ? Math.min(1, Math.round((paidAmount / totalAmount) * 100) / 100) : 1;

          return {
            contract: r.contractNumber || r.id.slice(-6),
            customer: customerName,
            totalAmount,
            paidAmount,
            open,
            collectionRate,
          };
        }).sort((a, b) => b.open - a.open);

        const totalAll = rows.reduce((s, r) => s + r.totalAmount, 0);
        const collectedAll = rows.reduce((s, r) => s + r.paidAmount, 0);
        const openAll = rows.reduce((s, r) => s + r.open, 0);
        const avgRate = totalAll > 0 ? Math.round((collectedAll / totalAll) * 100) / 100 : 1;

        return {
          columns: [
            { key: 'contract', label: 'Sözleşme No', type: 'text' },
            { key: 'customer', label: 'Müşteri', type: 'text' },
            { key: 'totalAmount', label: 'Toplam Tutar', type: 'money' },
            { key: 'paidAmount', label: 'Tahsil Edilen', type: 'money' },
            { key: 'open', label: 'Açık Bakiye', type: 'money' },
            { key: 'collectionRate', label: 'Tahsilat Oranı', type: 'percent' },
          ],
          rows,
          summary: {
            totalAmount: totalAll,
            paidAmount: collectedAll,
            open: openAll,
            collectionRate: avgRate,
          },
        };
      }

      case 'reservation-sources': {
        const inPeriodRes = reservations.filter((r) => isDateInPeriod(r.pickupAt || r.createdAt));
        const inPeriodRentals = rentals.filter((r) => isDateInPeriod(r.pickupAt || r.createdAt));

        const SOURCE_LABELS: Record<string, string> = {
          web: 'Web Sitesi (Online)',
          online: 'Web Sitesi (Online)',
          office: 'Ofis / Doğrudan',
          direct: 'Ofis / Doğrudan',
          phone: 'Çağrı Merkezi / Telefon',
          call_center: 'Çağrı Merkezi / Telefon',
          broker: 'Acente & Broker',
          corporate: 'Kurumsal Sözleşme',
        };

        const sourceGroups = new Map<string, { source: string; reservations: number; completed: number; cancelled: number; conversionRate: number }>();

        for (const res of inPeriodRes) {
          const rawSource = ((res as any).source || 'office').toLowerCase();
          const label = SOURCE_LABELS[rawSource] || 'Doğrudan / Diğer';
          const existing = sourceGroups.get(label) ?? { source: label, reservations: 0, completed: 0, cancelled: 0, conversionRate: 0 };
          existing.reservations++;
          if (res.status === 'converted' || (res.status as string) === 'completed') existing.completed++;
          if (res.status === 'cancelled' || res.status === 'no_show') existing.cancelled++;
          sourceGroups.set(label, existing);
        }

        for (const r of inPeriodRentals) {
          if (!r.reservationId) {
            const rawSource = ((r as any).source || 'office').toLowerCase();
            const label = SOURCE_LABELS[rawSource] || 'Doğrudan / Diğer';
            const existing = sourceGroups.get(label) ?? { source: label, reservations: 0, completed: 0, cancelled: 0, conversionRate: 0 };
            existing.reservations++;
            if (r.status !== 'cancelled' && r.status !== 'draft') existing.completed++;
            if (r.status === 'cancelled') existing.cancelled++;
            sourceGroups.set(label, existing);
          }
        }

        const rows = Array.from(sourceGroups.values()).map((row) => ({
          ...row,
          conversionRate: row.reservations > 0 ? Math.round((row.completed / row.reservations) * 100) / 100 : 0,
        })).sort((a, b) => b.reservations - a.reservations);

        const totalRes = rows.reduce((s, r) => s + r.reservations, 0);
        const totalComp = rows.reduce((s, r) => s + r.completed, 0);
        const avgConv = totalRes > 0 ? Math.round((totalComp / totalRes) * 100) / 100 : 0;

        return {
          columns: [
            { key: 'source', label: 'Kaynak', type: 'text' },
            { key: 'reservations', label: 'Rezervasyon Adedi', type: 'number' },
            { key: 'completed', label: 'Tamamlanan', type: 'number' },
            { key: 'cancelled', label: 'İptal Edilen', type: 'number' },
            { key: 'conversionRate', label: 'Dönüşüm Oranı', type: 'percent' },
          ],
          rows,
          summary: {
            reservations: totalRes,
            conversionRate: avgConv,
          },
        };
      }

      case 'customers': {
        const nonCancelledRentals = rentals.filter((r) => r.status !== 'cancelled' && r.status !== 'draft');

        const rows = customers.map((c) => {
          const cRentals = nonCancelledRentals
            .filter((r) => r.customerId === c.id && isDateInPeriod(r.pickupAt || r.createdAt));

          const rentalCount = cRentals.length;
          const totalSpent = cRentals.reduce((sum, r) => sum + (Number(r.price?.totalAmount) || 0), 0);

          const segCount = new Map<string, number>();
          for (const r of cRentals) {
            const v = vehicles.find((veh) => veh.id === r.vehicleId);
            const seg = v?.segment || 'Ekonomik';
            segCount.set(seg, (segCount.get(seg) || 0) + 1);
          }
          let preferredSegment = '—';
          let maxCount = 0;
          for (const [seg, cnt] of segCount.entries()) {
            if (cnt > maxCount) {
              maxCount = cnt;
              preferredSegment = seg;
            }
          }

          const customerName = c.companyName || `${c.firstName} ${c.lastName}`.trim() || 'Müşteri';

          return {
            customer: customerName,
            phone: c.phone || '—',
            rentalCount,
            totalSpent,
            preferredSegment,
          };
        }).sort((a, b) => b.totalSpent - a.totalSpent || b.rentalCount - a.rentalCount);

        return {
          columns: [
            { key: 'customer', label: 'Müşteri', type: 'text' },
            { key: 'phone', label: 'Telefon', type: 'text' },
            { key: 'rentalCount', label: 'Kiralama Adedi', type: 'number' },
            { key: 'totalSpent', label: 'Toplam Harcama', type: 'money' },
            { key: 'preferredSegment', label: 'Tercih Edilen Segment', type: 'text' },
          ],
          rows,
          summary: {
            totalSpent: rows.reduce((s, r) => s + r.totalSpent, 0),
            rentalCount: rows.reduce((s, r) => s + r.rentalCount, 0),
          },
        };
      }

      default:
        return { columns: [], rows: [] };
    }
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

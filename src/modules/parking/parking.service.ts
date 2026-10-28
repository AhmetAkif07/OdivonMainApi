import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { createBaseFields, omitUndefined, touchBaseFields } from '../../shared/firestore/base-document';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  AgentEventDto, CloseCashShiftDto, CreateEntryDto, CreateFacilityDto, CreateLaneDto, CreatePaymentDto,
  CreateSlotDto, CreateTariffDto, CreateZoneDto, ExitSessionDto, LiveQueryDto,
  LostTicketDto, ManualOverrideDto, OpenCashShiftDto, ParkingListQueryDto, QuoteSessionDto,
  RefundPaymentDto, UpdateFacilityDto, UpdateLaneDto, UpdateSlotDto, UpdateTariffDto, UpdateZoneDto,
} from './parking.dto';
import { calculateParkingQuote } from './parking-pricing';
import {
  ParkingCashShift, ParkingFacility, ParkingLane, ParkingPayment, ParkingSession, ParkingSlot,
  ParkingTariff, ParkingZone,
} from './parking.types';

type ParkingDoc = { id: string; createdAt: string; updatedAt: string; deletedAt?: string | null };

@Injectable()
export class ParkingService {
  constructor(private readonly firebase: FirebaseService, private readonly tenant: TenantContext) {}

  private collection(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), name));
  }
  private ref(name: string, id: string): DocumentReference { return this.collection(name).doc(id); }
  private now(): string { return new Date().toISOString(); }
  private actor(): string { return this.tenant.getUserId(); }

  async dashboard(facilityId?: string) {
    const [facilities, sessions, payments, agents] = await Promise.all([
      this.rows<ParkingFacility>(TENANT_COLLECTION.parkingFacilities),
      this.rows<ParkingSession>(TENANT_COLLECTION.parkingSessions),
      this.rows<ParkingPayment>(TENANT_COLLECTION.parkingPayments),
      this.rows<ParkingDoc>(TENANT_COLLECTION.parkingDeviceAgents),
    ]);
    const allowed = facilities.filter((item) => this.canAccessFacility(item.id));
    const ids = new Set(allowed.map((item) => item.id));
    if (facilityId) this.assertFacilityAccess(facilityId);
    const wanted = facilityId ? new Set([facilityId]) : ids;
    const scopedSessions = sessions.filter((item) => wanted.has(item.facilityId));
    const today = new Date().toISOString().slice(0, 10);
    return {
      capacity: allowed.filter((item) => wanted.has(item.id)).reduce((sum, item) => sum + item.capacity, 0),
      occupied: allowed.filter((item) => wanted.has(item.id)).reduce((sum, item) => sum + item.occupied, 0),
      activeSessions: scopedSessions.filter((item) => ['active', 'payment_due', 'paid', 'lost_ticket'].includes(item.status)).length,
      todayEntries: scopedSessions.filter((item) => item.enteredAt.startsWith(today)).length,
      todayExits: scopedSessions.filter((item) => item.exitedAt?.startsWith(today)).length,
      todayRevenueKurus: payments.filter((item) => wanted.has(item.facilityId) && item.createdAt.startsWith(today) && item.status === 'completed').reduce((sum, item) => sum + item.amountKurus, 0),
      offlineAgents: agents.filter((item) => Date.now() - Date.parse(String((item as unknown as Record<string, unknown>)['lastSeenAt'] ?? 0)) > 30_000).length,
      facilities: allowed.filter((item) => wanted.has(item.id)),
    };
  }

  async seedPilot() {
    const existing = (await this.rows<ParkingFacility>(TENANT_COLLECTION.parkingFacilities)).find((item) => item.code === 'PILOT-IST');
    if (existing) {
      this.assertFacilityAccess(existing.id);
      const [zones, lanes, tariffs] = await Promise.all([this.rows<ParkingZone>(TENANT_COLLECTION.parkingZones), this.rows<ParkingLane>(TENANT_COLLECTION.parkingLanes), this.rows<ParkingTariff>(TENANT_COLLECTION.parkingTariffs)]);
      return { facility: existing, zone: zones.find((item) => item.facilityId === existing.id && item.code === 'ANA') ?? null, lanes: lanes.filter((item) => item.facilityId === existing.id), tariff: tariffs.find((item) => item.facilityId === existing.id) ?? null, created: false };
    }
    const facility = await this.createFacility({ name: 'OdivonPark Pilot', code: 'PILOT-IST', address: 'İstanbul', capacity: 120, active: true });
    const zone = await this.createZone({ facilityId: facility.id, name: 'Ana Bölge', code: 'ANA', capacity: 120, slotTracking: false, vehicleCategories: ['car', 'motorcycle', 'electric'], active: true });
    const entryLane = await this.createLane({ facilityId: facility.id, zoneId: zone.id, name: 'Ana Giriş', direction: 'entry', active: true });
    const exitLane = await this.createLane({ facilityId: facility.id, zoneId: zone.id, name: 'Ana Çıkış', direction: 'exit', active: true });
    const tariff = await this.createTariff({ facilityId: facility.id, name: 'Pilot Standart', graceMinutes: 15, dailyCapKurus: 30000, lostTicketFeeKurus: 45000, vehicleCategories: ['car', 'motorcycle', 'electric'], bands: [{ fromMinute: 1, toMinute: 60, priceKurus: 5000 }, { fromMinute: 61, toMinute: 180, priceKurus: 10000 }, { fromMinute: 181, toMinute: null, priceKurus: 20000 }], active: true });
    return { facility, zone, lanes: [entryLane, exitLane], tariff, created: true };
  }

  facilities(query: ParkingListQueryDto) { return this.list<ParkingFacility>(TENANT_COLLECTION.parkingFacilities, query, (item) => this.canAccessFacility(item.id)); }
  async createFacility(dto: CreateFacilityDto) {
    return this.create<ParkingFacility>(TENANT_COLLECTION.parkingFacilities, 'facility', {
      ...dto, code: dto.code.trim().toUpperCase(), address: dto.address ?? null,
      timezone: 'Europe/Istanbul', occupied: 0, active: dto.active ?? true,
    });
  }
  async updateFacility(id: string, dto: UpdateFacilityDto) {
    this.assertFacilityAccess(id);
    const current = await this.get<ParkingFacility>(TENANT_COLLECTION.parkingFacilities, id);
    if (dto.capacity !== undefined && dto.capacity < current.occupied) this.invalid('Kapasite mevcut doluluktan küçük olamaz.');
    return this.update<ParkingFacility>(TENANT_COLLECTION.parkingFacilities, 'facility', id, { ...dto, ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}) });
  }

  zones(query: ParkingListQueryDto) { return this.list<ParkingZone>(TENANT_COLLECTION.parkingZones, query, (item) => this.canAccessFacility(item.facilityId)); }
  async createZone(dto: CreateZoneDto) {
    this.assertFacilityAccess(dto.facilityId); await this.get(TENANT_COLLECTION.parkingFacilities, dto.facilityId);
    return this.create<ParkingZone>(TENANT_COLLECTION.parkingZones, 'zone', { ...dto, code: dto.code.trim().toUpperCase(), occupied: 0, slotTracking: dto.slotTracking ?? false, active: dto.active ?? true });
  }
  async updateZone(id: string, dto: UpdateZoneDto) {
    const current = await this.get<ParkingZone>(TENANT_COLLECTION.parkingZones, id); this.assertFacilityAccess(current.facilityId);
    if (dto.facilityId && dto.facilityId !== current.facilityId) this.invalid('Bölge başka tesise taşınamaz.');
    if (dto.capacity !== undefined && dto.capacity < current.occupied) this.invalid('Kapasite mevcut doluluktan küçük olamaz.');
    return this.update<ParkingZone>(TENANT_COLLECTION.parkingZones, 'zone', id, { ...dto, ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}) });
  }

  slots(query: ParkingListQueryDto) { return this.list<ParkingSlot>(TENANT_COLLECTION.parkingSlots, query, (item) => this.canAccessFacility(item.facilityId)); }
  async createSlot(dto: CreateSlotDto) {
    this.assertFacilityAccess(dto.facilityId); const zone = await this.get<ParkingZone>(TENANT_COLLECTION.parkingZones, dto.zoneId);
    if (zone.facilityId !== dto.facilityId) this.invalid('Bölge tesise ait değil.');
    return this.create<ParkingSlot>(TENANT_COLLECTION.parkingSlots, 'slot', { ...dto, code: dto.code.trim().toUpperCase(), kind: dto.kind ?? 'standard', status: 'available', activeSessionId: null, active: dto.active ?? true });
  }
  async updateSlot(id: string, dto: UpdateSlotDto) {
    const current = await this.get<ParkingSlot>(TENANT_COLLECTION.parkingSlots, id); this.assertFacilityAccess(current.facilityId);
    if ((dto.facilityId && dto.facilityId !== current.facilityId) || (dto.zoneId && dto.zoneId !== current.zoneId)) this.invalid('Dolu slot başka alana taşınamaz.');
    return this.update<ParkingSlot>(TENANT_COLLECTION.parkingSlots, 'slot', id, { ...dto, ...(dto.code ? { code: dto.code.trim().toUpperCase() } : {}) });
  }

  lanes(query: ParkingListQueryDto) { return this.list<ParkingLane>(TENANT_COLLECTION.parkingLanes, query, (item) => this.canAccessFacility(item.facilityId)); }
  async createLane(dto: CreateLaneDto) {
    this.assertFacilityAccess(dto.facilityId); const zone = await this.get<ParkingZone>(TENANT_COLLECTION.parkingZones, dto.zoneId);
    if (zone.facilityId !== dto.facilityId) this.invalid('Bölge tesise ait değil.');
    return this.create<ParkingLane>(TENANT_COLLECTION.parkingLanes, 'lane', { ...dto, active: dto.active ?? true, offlineEntryPolicy: 'cached_rules', offlineExitPolicy: 'allow_with_audit' });
  }
  async updateLane(id: string, dto: UpdateLaneDto) {
    const current = await this.get<ParkingLane>(TENANT_COLLECTION.parkingLanes, id); this.assertFacilityAccess(current.facilityId);
    if (dto.facilityId && dto.facilityId !== current.facilityId) this.invalid('Şerit başka tesise taşınamaz.');
    return this.update<ParkingLane>(TENANT_COLLECTION.parkingLanes, 'lane', id, dto);
  }

  tariffs(query: ParkingListQueryDto) { return this.list<ParkingTariff>(TENANT_COLLECTION.parkingTariffs, query, (item) => this.canAccessFacility(item.facilityId)); }
  async createTariff(dto: CreateTariffDto) {
    this.assertFacilityAccess(dto.facilityId); this.validateBands(dto.bands);
    return this.create<ParkingTariff>(TENANT_COLLECTION.parkingTariffs, 'tariff', { ...dto, zoneId: dto.zoneId ?? null, version: 1, currency: 'TRY', graceMinutes: dto.graceMinutes ?? 0, dailyCapKurus: dto.dailyCapKurus ?? null, active: dto.active ?? true });
  }
  async updateTariff(id: string, dto: UpdateTariffDto) {
    const current = await this.get<ParkingTariff>(TENANT_COLLECTION.parkingTariffs, id); this.assertFacilityAccess(current.facilityId);
    if (dto.version !== current.version) this.conflict('Tarife başka bir kullanıcı tarafından güncellendi.');
    if (dto.bands) this.validateBands(dto.bands);
    return this.update<ParkingTariff>(TENANT_COLLECTION.parkingTariffs, 'tariff', id, { ...dto, version: current.version + 1 });
  }

  sessions(query: ParkingListQueryDto) { return this.list<ParkingSession>(TENANT_COLLECTION.parkingSessions, query, (item) => this.canAccessFacility(item.facilityId)); }

  async createEntry(dto: CreateEntryDto, key: string) {
    this.requireKey(key); this.assertFacilityAccess(dto.facilityId);
    const normalizedPlate = dto.plate ? normalizePlate(dto.plate) : null;
    if (!normalizedPlate && !dto.ticketCode) this.invalid('Plaka veya QR bilet gereklidir.');
    const idempotencyRef = this.idempotencyRef(key);
    const facilityRef = this.ref(TENANT_COLLECTION.parkingFacilities, dto.facilityId);
    const zoneRef = this.ref(TENANT_COLLECTION.parkingZones, dto.zoneId);
    const slotRef = dto.slotId ? this.ref(TENANT_COLLECTION.parkingSlots, dto.slotId) : null;
    const sessionRef = this.collection(TENANT_COLLECTION.parkingSessions).doc();
    const result = await this.firebase.db.runTransaction(async (tx) => {
      const [idemSnap, facilitySnap, zoneSnap, slotSnap, activeSnap] = await Promise.all([
        tx.get(idempotencyRef), tx.get(facilityRef), tx.get(zoneRef), slotRef ? tx.get(slotRef) : Promise.resolve(null),
        normalizedPlate ? tx.get(this.collection(TENANT_COLLECTION.parkingSessions).where('facilityId', '==', dto.facilityId).where('plate', '==', normalizedPlate)) : Promise.resolve(null),
      ]);
      if (idemSnap.exists) return idemSnap.data()?.['result'] as ParkingSession;
      const facility = facilitySnap.data() as ParkingFacility | undefined;
      const zone = zoneSnap.data() as ParkingZone | undefined;
      if (!facility || facility.deletedAt || !zone || zone.deletedAt || zone.facilityId !== dto.facilityId) this.notFound('Tesis veya bölge bulunamadı.');
      if (!facility.active || !zone.active) this.invalid('Tesis veya bölge aktif değil.');
      if (facility.occupied >= facility.capacity || zone.occupied >= zone.capacity) this.conflict('Otopark kapasitesi dolu.');
      if (activeSnap && activeSnap.docs.some((doc) => ['active', 'payment_due', 'paid', 'lost_ticket'].includes(String(doc.data()['status'])))) this.conflict('Bu plaka için aktif bir park oturumu zaten var.');
      const slot = slotSnap?.data() as ParkingSlot | undefined;
      if (zone.slotTracking && (!slot || slot.zoneId !== zone.id || slot.status !== 'available')) this.conflict('Geçerli ve müsait bir slot gereklidir.');
      const now = dto.occurredAt ?? this.now();
      const session: ParkingSession = {
        ...createBaseFields(sessionRef.id, this.actor(), now), id: sessionRef.id, tenantId: this.tenant.getTenantId(),
        facilityId: dto.facilityId, zoneId: dto.zoneId, slotId: dto.slotId ?? null,
        entryLaneId: dto.laneId ?? null, exitLaneId: null, plate: normalizedPlate,
        ticketCode: dto.ticketCode ?? this.createTicket(sessionRef.id), vehicleCategory: dto.vehicleCategory,
        source: dto.source ?? 'operator', status: 'active', enteredAt: now, paidAt: null, exitedAt: null,
        quote: null, paidKurus: 0, version: 1,
      };
      tx.create(sessionRef, session);
      tx.update(facilityRef, { occupied: facility.occupied + 1, ...touchBaseFields(this.actor(), now) });
      tx.update(zoneRef, { occupied: zone.occupied + 1, ...touchBaseFields(this.actor(), now) });
      if (slotRef) tx.update(slotRef, { status: 'occupied', activeSessionId: session.id, ...touchBaseFields(this.actor(), now) });
      tx.create(idempotencyRef, { keyHash: idempotencyRef.id, operation: 'entry', result: session, createdAt: now });
      this.auditTx(tx, 'entry.created', session.id, { facilityId: dto.facilityId, zoneId: dto.zoneId, plate: normalizedPlate }, now);
      return session;
    });
    return result;
  }

  async quoteSession(id: string, dto: QuoteSessionDto) {
    const session = await this.get<ParkingSession>(TENANT_COLLECTION.parkingSessions, id); this.assertFacilityAccess(session.facilityId);
    if (session.status === 'exited' || session.status === 'cancelled') this.invalid('Kapalı oturum ücretlendirilemez.');
    const tariffs = await this.rows<ParkingTariff>(TENANT_COLLECTION.parkingTariffs);
    const tariff = tariffs.filter((item) => item.active && item.facilityId === session.facilityId && (item.zoneId === null || item.zoneId === session.zoneId) && item.vehicleCategories.includes(session.vehicleCategory)).sort((a, b) => Number(b.zoneId !== null) - Number(a.zoneId !== null) || b.version - a.version)[0];
    if (!tariff) this.notFound('Uygun aktif tarife bulunamadı.');
    const quote = calculateParkingQuote(tariff, { enteredAt: session.enteredAt, exitedAt: dto.exitAt ?? this.now(), lostTicket: dto.lostTicket ?? session.status === 'lost_ticket' });
    const next = { quote, status: quote.totalKurus === 0 ? 'paid' : session.status === 'lost_ticket' ? 'lost_ticket' : 'payment_due', ...(quote.totalKurus === 0 ? { paidAt: this.now() } : {}), version: session.version + 1, ...touchBaseFields(this.actor()) };
    await this.ref(TENANT_COLLECTION.parkingSessions, id).update(next);
    await this.audit('session.quoted', id, { totalKurus: quote.totalKurus, tariffId: tariff.id });
    return { ...session, ...next };
  }

  async markLostTicket(id: string, dto: LostTicketDto) {
    const session = await this.get<ParkingSession>(TENANT_COLLECTION.parkingSessions, id); this.assertFacilityAccess(session.facilityId);
    if (session.version !== dto.version) this.conflict('Oturum sürümü güncel değil.');
    const next = { status: 'lost_ticket', version: session.version + 1, ...touchBaseFields(this.actor()) };
    await this.ref(TENANT_COLLECTION.parkingSessions, id).update(next); await this.audit('session.lost_ticket', id, { reason: dto.reason });
    return this.quoteSession(id, { lostTicket: true });
  }

  async createPayment(dto: CreatePaymentDto, key: string) {
    this.requireKey(key); const session = await this.get<ParkingSession>(TENANT_COLLECTION.parkingSessions, dto.sessionId); this.assertFacilityAccess(session.facilityId);
    if (!session.quote) this.invalid('Ödeme öncesi güncel fiyat teklifi oluşturulmalıdır.');
    if (session.version !== dto.version) this.conflict('Oturum sürümü güncel değil.');
    if (dto.amountKurus !== session.quote.totalKurus - session.paidKurus) this.invalid('Kısmi veya fazla ödeme desteklenmiyor.');
    const shift = await this.get<ParkingCashShift>(TENANT_COLLECTION.parkingCashShifts, dto.cashShiftId);
    if (shift.status !== 'open' || shift.facilityId !== session.facilityId) this.invalid('Açık ve aynı tesise ait kasa vardiyası gereklidir.');
    const idem = this.idempotencyRef(key); const existing = await idem.get();
    if (existing.exists) return existing.data()?.['result'];
    const ref = this.collection(TENANT_COLLECTION.parkingPayments).doc(); const now = this.now();
    const payment: ParkingPayment = { ...createBaseFields(ref.id, this.actor(), now), id: ref.id, tenantId: this.tenant.getTenantId(), facilityId: session.facilityId, sessionId: session.id, cashShiftId: dto.cashShiftId, method: dto.method, amountKurus: dto.amountKurus, currency: 'TRY', status: 'completed', refundedAt: null, refundReason: null };
    await this.firebase.db.runTransaction(async (tx) => {
      const latest = await tx.get(this.ref(TENANT_COLLECTION.parkingSessions, session.id)); const data = latest.data() as ParkingSession | undefined;
      if (!data || data.version !== dto.version) this.conflict('Oturum sürümü güncel değil.');
      tx.create(ref, payment); tx.update(latest.ref, { status: 'paid', paidKurus: dto.amountKurus, paidAt: now, version: data.version + 1, ...touchBaseFields(this.actor(), now) });
      tx.create(idem, { keyHash: idem.id, operation: 'payment', result: payment, createdAt: now });
      this.auditTx(tx, 'payment.completed', payment.id, { sessionId: session.id, amountKurus: dto.amountKurus, method: dto.method }, now);
    });
    return payment;
  }

  async exitSession(id: string, dto: ExitSessionDto, key: string) {
    this.requireKey(key); const session = await this.get<ParkingSession>(TENANT_COLLECTION.parkingSessions, id); this.assertFacilityAccess(session.facilityId);
    if (session.version !== dto.version) this.conflict('Oturum sürümü güncel değil.');
    if (session.status !== 'paid') this.conflict('Ödeme tamamlanmadan çıkış yapılamaz.');
    const idem = this.idempotencyRef(key); const facilityRef = this.ref(TENANT_COLLECTION.parkingFacilities, session.facilityId); const zoneRef = this.ref(TENANT_COLLECTION.parkingZones, session.zoneId); const slotRef = session.slotId ? this.ref(TENANT_COLLECTION.parkingSlots, session.slotId) : null;
    return this.firebase.db.runTransaction(async (tx) => {
      const [idemSnap, sessionSnap, facilitySnap, zoneSnap] = await Promise.all([tx.get(idem), tx.get(this.ref(TENANT_COLLECTION.parkingSessions, id)), tx.get(facilityRef), tx.get(zoneRef)]);
      if (idemSnap.exists) return idemSnap.data()?.['result'];
      const latest = sessionSnap.data() as ParkingSession | undefined; const facility = facilitySnap.data() as ParkingFacility | undefined; const zone = zoneSnap.data() as ParkingZone | undefined;
      if (!latest || !facility || !zone || latest.version !== dto.version || latest.status !== 'paid') this.conflict('Oturum çıkışa uygun değil.');
      const now = dto.occurredAt ?? this.now(); const result = { ...latest, status: 'exited' as const, exitLaneId: dto.laneId ?? null, exitedAt: now, version: latest.version + 1, ...touchBaseFields(this.actor(), now) };
      tx.set(sessionSnap.ref, result); tx.update(facilityRef, { occupied: Math.max(0, facility.occupied - 1), ...touchBaseFields(this.actor(), now) }); tx.update(zoneRef, { occupied: Math.max(0, zone.occupied - 1), ...touchBaseFields(this.actor(), now) });
      if (slotRef) tx.update(slotRef, { status: 'available', activeSessionId: null, ...touchBaseFields(this.actor(), now) });
      tx.create(idem, { keyHash: idem.id, operation: 'exit', result, createdAt: now }); this.auditTx(tx, 'session.exited', id, { laneId: dto.laneId ?? null }, now); return result;
    });
  }

  async processAgentEvent(event: AgentEventDto, lane: ParkingLane, idempotencyKey: string) {
    this.assertFacilityAccess(lane.facilityId);
    if (event.kind === 'entry') {
      return this.createEntry({ facilityId: lane.facilityId, zoneId: lane.zoneId, laneId: lane.id, plate: event.plate, ticketCode: event.ticketCode, vehicleCategory: 'car', source: 'agent' }, idempotencyKey);
    }
    if (event.kind === 'manual_override') {
      await this.audit('agent.manual_override', event.eventId, { laneId: lane.id, facilityId: lane.facilityId, deviceTime: event.deviceTime, raw: event.raw ?? null });
      return { audited: true };
    }
    const plate = event.plate ? normalizePlate(event.plate) : null;
    const session = (await this.rows<ParkingSession>(TENANT_COLLECTION.parkingSessions)).find((item) => item.facilityId === lane.facilityId && ['active', 'payment_due', 'paid', 'lost_ticket'].includes(item.status) && (plate ? item.plate === plate : item.ticketCode === event.ticketCode));
    if (!session) {
      await this.audit('agent.exit.unmatched', event.eventId, { laneId: lane.id, facilityId: lane.facilityId, plate, ticketCode: event.ticketCode ?? null, deviceTime: event.deviceTime });
      return { manualReview: true, reason: 'session_not_found' };
    }
    if (session.status === 'paid') return this.exitSession(session.id, { version: session.version, laneId: lane.id }, idempotencyKey);
    const idem = this.idempotencyRef(idempotencyKey); const sessionRef = this.ref(TENANT_COLLECTION.parkingSessions, session.id); const facilityRef = this.ref(TENANT_COLLECTION.parkingFacilities, session.facilityId); const zoneRef = this.ref(TENANT_COLLECTION.parkingZones, session.zoneId); const slotRef = session.slotId ? this.ref(TENANT_COLLECTION.parkingSlots, session.slotId) : null;
    return this.firebase.db.runTransaction(async (tx) => {
      const [idemSnap, sessionSnap, facilitySnap, zoneSnap] = await Promise.all([tx.get(idem), tx.get(sessionRef), tx.get(facilityRef), tx.get(zoneRef)]);
      if (idemSnap.exists) return idemSnap.data()?.['result'];
      const latest = sessionSnap.data() as ParkingSession | undefined; const facility = facilitySnap.data() as ParkingFacility | undefined; const zone = zoneSnap.data() as ParkingZone | undefined;
      if (!latest || !facility || !zone) this.notFound('Agent çıkış kaydı için park oturumu bulunamadı.');
      const now = this.now(); const result = { ...latest, status: 'manual_review' as const, exitLaneId: lane.id, exitedAt: now, version: latest.version + 1, ...touchBaseFields(this.actor(), now) };
      tx.update(sessionRef, result); tx.update(facilityRef, { occupied: Math.max(0, facility.occupied - 1), ...touchBaseFields(this.actor(), now) }); tx.update(zoneRef, { occupied: Math.max(0, zone.occupied - 1), ...touchBaseFields(this.actor(), now) }); if (slotRef) tx.update(slotRef, { status: 'available', activeSessionId: null, ...touchBaseFields(this.actor(), now) });
      tx.create(idem, { keyHash: idem.id, operation: 'agent_fail_open_exit', result, createdAt: now }); this.auditTx(tx, 'agent.exit.fail_open', session.id, { laneId: lane.id, deviceTime: event.deviceTime, previousStatus: latest.status }, now); return result;
    });
  }

  async openCashShift(dto: OpenCashShiftDto) {
    this.assertFacilityAccess(dto.facilityId); const existing = (await this.rows<ParkingCashShift>(TENANT_COLLECTION.parkingCashShifts)).find((item) => item.facilityId === dto.facilityId && item.openedBy === this.actor() && item.status === 'open');
    if (existing) this.conflict('Kullanıcının bu tesiste açık kasa vardiyası var.');
    const now = this.now(); return this.create<ParkingCashShift>(TENANT_COLLECTION.parkingCashShifts, 'cashShift', { tenantId: this.tenant.getTenantId(), facilityId: dto.facilityId, openedBy: this.actor(), openedAt: now, openingFloatKurus: dto.openingFloatKurus ?? 0, status: 'open', closedAt: null, expectedCashKurus: null, countedCashKurus: null, differenceKurus: null });
  }

  async closeCashShift(id: string, dto: CloseCashShiftDto) {
    const shift = await this.get<ParkingCashShift>(TENANT_COLLECTION.parkingCashShifts, id); this.assertFacilityAccess(shift.facilityId); if (shift.status !== 'open') this.invalid('Kasa vardiyası zaten kapalı.');
    const payments = await this.rows<ParkingPayment>(TENANT_COLLECTION.parkingPayments); const cash = payments.filter((item) => item.cashShiftId === id && item.method === 'cash' && item.status === 'completed').reduce((sum, item) => sum + item.amountKurus, 0); const expected = shift.openingFloatKurus + cash;
    return this.update<ParkingCashShift>(TENANT_COLLECTION.parkingCashShifts, 'cashShift', id, { status: 'closed', closedAt: this.now(), expectedCashKurus: expected, countedCashKurus: dto.countedCashKurus, differenceKurus: dto.countedCashKurus - expected });
  }

  async refundPayment(id: string, dto: RefundPaymentDto, key: string) {
    this.requireKey(key); const payment = await this.get<ParkingPayment>(TENANT_COLLECTION.parkingPayments, id); this.assertFacilityAccess(payment.facilityId); if (payment.status === 'refunded') this.conflict('Ödeme zaten iade edilmiş.');
    const idem = this.idempotencyRef(key); const existing = await idem.get(); if (existing.exists) return existing.data()?.['result'];
    const now = this.now(); const result = { ...payment, status: 'refunded' as const, refundedAt: now, refundReason: dto.reason, ...touchBaseFields(this.actor(), now) };
    await this.firebase.db.runTransaction(async (tx) => { tx.set(this.ref(TENANT_COLLECTION.parkingPayments, id), result); tx.create(idem, { keyHash: idem.id, operation: 'refund', result, createdAt: now }); this.auditTx(tx, 'payment.refunded', id, { reason: dto.reason, amountKurus: payment.amountKurus }, now); }); return result;
  }

  async manualOverride(dto: ManualOverrideDto) {
    this.assertFacilityAccess(dto.facilityId); if (dto.action === 'price_adjustment' && !dto.sessionId) this.invalid('Fiyat düzeltmesi için oturum gereklidir.');
    if (dto.action === 'price_adjustment') {
      const session = await this.get<ParkingSession>(TENANT_COLLECTION.parkingSessions, dto.sessionId!); if (session.facilityId !== dto.facilityId || !session.quote) this.invalid('Oturum veya fiyat teklifi geçersiz.');
      const totalKurus = Math.max(0, session.quote.totalKurus + (dto.adjustmentKurus ?? 0)); await this.ref(TENANT_COLLECTION.parkingSessions, session.id).update({ quote: { ...session.quote, totalKurus, lines: [...session.quote.lines, { label: `Manuel düzeltme: ${dto.reason}`, amountKurus: dto.adjustmentKurus ?? 0 }] }, version: session.version + 1, ...touchBaseFields(this.actor()) });
    }
    const command = await this.create<ParkingDoc>(TENANT_COLLECTION.parkingDeviceCommands, 'manualOverride', { tenantId: this.tenant.getTenantId(), facilityId: dto.facilityId, laneId: dto.laneId ?? null, sessionId: dto.sessionId ?? null, action: dto.action, reason: dto.reason, adjustmentKurus: dto.adjustmentKurus ?? null, status: 'pending', version: 1 }); return command;
  }

  async live(query: LiveQueryDto) {
    this.assertFacilityAccess(query.facilityId); const since = query.cursor ? new Date(Buffer.from(query.cursor, 'base64url').toString('utf8')).toISOString() : new Date(Date.now() - 60_000).toISOString(); const cursorAt = this.now();
    const [sessions, agents, payments, lanes, facility] = await Promise.all([this.rows<ParkingSession>(TENANT_COLLECTION.parkingSessions), this.rows<ParkingDoc>(TENANT_COLLECTION.parkingDeviceAgents), this.rows<ParkingPayment>(TENANT_COLLECTION.parkingPayments), this.rows<ParkingLane>(TENANT_COLLECTION.parkingLanes), this.get<ParkingFacility>(TENANT_COLLECTION.parkingFacilities, query.facilityId)]);
    const facilityLaneIds = new Set(lanes.filter((lane) => lane.facilityId === query.facilityId).map((lane) => lane.id));
    return { cursor: Buffer.from(cursorAt).toString('base64url'), facility, sessions: sessions.filter((item) => item.facilityId === query.facilityId && item.updatedAt >= since), payments: payments.filter((item) => item.facilityId === query.facilityId && item.updatedAt >= since), agents: agents.filter((item) => { const record = item as unknown as Record<string, unknown>; return (record['laneIds'] as string[] | undefined)?.some((laneId) => facilityLaneIds.has(laneId)) && String(record['updatedAt'] ?? '') >= since; }) };
  }

  async softDelete(name: string, id: string) {
    const current = await this.get<ParkingDoc>(name, id); const record = current as unknown as Record<string, unknown>; const facilityId = name === TENANT_COLLECTION.parkingFacilities ? id : String(record['facilityId']); this.assertFacilityAccess(facilityId);
    if (['occupied', 'active', 'payment_due', 'paid'].includes(String(record['status'] ?? ''))) this.conflict('Aktif veya dolu kayıt silinemez.');
    await this.ref(name, id).update({ deletedAt: this.now(), deletedBy: this.actor(), ...touchBaseFields(this.actor()) }); await this.audit('record.deleted', id, { collection: name }); return { id };
  }

  verifyTicket(value: string): boolean {
    const parts = value.split('.'); if (parts.length !== 3 || parts[0] !== 'ODP') return false;
    const expected = this.ticketSignature(parts[1]); const actual = Buffer.from(parts[2]); const wanted = Buffer.from(expected); return actual.length === wanted.length && timingSafeEqual(actual, wanted);
  }

  private async list<T extends ParkingDoc>(name: string, query: ParkingListQueryDto, scope: (item: T) => boolean) {
    const rows = (await this.rows<T>(name)).filter(scope).filter((item) => { const record = item as unknown as Record<string, unknown>; return (!query.facilityId || record['facilityId'] === query.facilityId || item.id === query.facilityId) && (!query.zoneId || record['zoneId'] === query.zoneId) && (!query.status || record['status'] === query.status) && (!query.search || JSON.stringify(item).toLocaleLowerCase('tr').includes(query.search.toLocaleLowerCase('tr'))); }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const limit = query.limit ?? 20; const start = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) || 0 : 0; const items = rows.slice(start, start + limit); return { items, nextCursor: start + limit < rows.length ? Buffer.from(String(start + limit)).toString('base64url') : null };
  }
  private async rows<T extends ParkingDoc>(name: string): Promise<T[]> { const snapshot = await this.collection(name).get(); return snapshot.docs.map((doc) => ({ ...(doc.data() as T), id: doc.id })).filter((item) => !item.deletedAt); }
  private async get<T extends ParkingDoc>(name: string, id: string): Promise<T> { const snapshot = await this.ref(name, id).get(); const value = snapshot.exists ? ({ ...(snapshot.data() as T), id: snapshot.id } as T) : null; if (!value || value.deletedAt) this.notFound('Kayıt bulunamadı.'); return value; }
  private async create<T extends ParkingDoc>(name: string, entity: string, fields: object): Promise<T> { const ref = this.collection(name).doc(); const item = { ...createBaseFields(ref.id, this.actor()), ...omitUndefined(fields as Record<string, unknown>), id: ref.id, tenantId: this.tenant.getTenantId() } as unknown as T; await ref.set(item); await this.audit(`${entity}.created`, ref.id, {}); return item; }
  private async update<T extends ParkingDoc>(name: string, entity: string, id: string, fields: object): Promise<T> { const current = await this.get<T>(name, id); const item = { ...current, ...omitUndefined(fields as Record<string, unknown>), ...touchBaseFields(this.actor()) } as T; await this.ref(name, id).set(item); await this.audit(`${entity}.updated`, id, {}); return item; }
  private idempotencyRef(key: string) { return this.ref(TENANT_COLLECTION.parkingIdempotencyKeys, createHash('sha256').update(key).digest('hex')); }
  private requireKey(key: string) { if (!key || key.length < 8 || key.length > 200) this.invalid('Geçerli Idempotency-Key başlığı gereklidir.'); }
  private createTicket(sessionId: string) { const payload = `${sessionId}-${randomBytes(5).toString('base64url')}`; return `ODP.${payload}.${this.ticketSignature(payload)}`; }
  private ticketSignature(payload: string) { return createHmac('sha256', process.env.PARKING_TICKET_SECRET || process.env.FIREBASE_PRIVATE_KEY || 'odivonpark-local-development').update(payload).digest('base64url').slice(0, 22); }
  private canAccessFacility(id: string): boolean { const user = this.tenant.getStore(); return user.role === 'owner' || user.allBranches === true || (user.branchIds ?? []).includes(id); }
  private assertFacilityAccess(id: string) { if (!this.canAccessFacility(id)) throw new AppException(ErrorCode.PARKING_FORBIDDEN, 'Bu otoparka erişim yetkiniz yok.'); }
  private validateBands(bands: Array<{ fromMinute: number; toMinute?: number | null; priceKurus: number }>) { const sorted = [...bands].sort((a, b) => a.fromMinute - b.fromMinute); if (sorted[0].fromMinute !== 1 || sorted.some((band, index) => band.toMinute !== null && band.toMinute !== undefined && band.toMinute < band.fromMinute || index > 0 && sorted[index - 1].toMinute !== null && sorted[index - 1].toMinute !== band.fromMinute - 1) || sorted.at(-1)?.toMinute !== null) this.invalid('Tarife bantları 1. dakikadan başlamalı, kesintisiz olmalı ve son bant açık uçlu olmalıdır.'); }
  private async audit(action: string, entityId: string, details: Record<string, unknown>) { const ref = this.collection(TENANT_COLLECTION.parkingAuditLogs).doc(); await ref.set({ id: ref.id, tenantId: this.tenant.getTenantId(), action, entityId, details, actorId: this.actor(), createdAt: this.now() }); }
  private auditTx(tx: Transaction, action: string, entityId: string, details: Record<string, unknown>, now: string) { const ref = this.collection(TENANT_COLLECTION.parkingAuditLogs).doc(); tx.create(ref, { id: ref.id, tenantId: this.tenant.getTenantId(), action, entityId, details, actorId: this.actor(), createdAt: now }); }
  private invalid(message: string): never { throw new AppException(ErrorCode.PARKING_INVALID, message); }
  private conflict(message: string): never { throw new AppException(ErrorCode.PARKING_CONFLICT, message); }
  private notFound(message: string): never { throw new AppException(ErrorCode.PARKING_NOT_FOUND, message); }
}

export function normalizePlate(value: string): string { return value.toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g, '').slice(0, 16); }

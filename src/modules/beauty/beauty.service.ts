import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { createBaseFields, isDeleted, touchBaseFields } from '../../shared/firestore/base-document';
import {
  BeautyAppointmentDto,
  BeautyAvailabilityDto,
  BeautyListQueryDto,
  BeautyOnboardingDto,
  BeautyPaymentDto,
  BeautyRecommendationDto,
  BeautyRecordDto,
  BeautyRefundDto,
  CompleteBeautySessionDto,
} from './beauty.dto';
import { AuditMeta, BeautyDoc, BeautyStore } from './shared/beauty-store';
import { commissionAmount, conflictReason, nextSessionDue } from './shared/beauty-rules';
import {
  BEAUTY_ROLE_PERMISSIONS,
  BEAUTY_ROLES,
  BeautyRole,
  beautyRoleId,
} from './shared/beauty-roles';

@Injectable()
export class BeautyService {
  constructor(private readonly store: BeautyStore) {}

  async me() {
    const actor = this.store.actor();
    const role = beautyRoleFor(actor.role, actor.roleIds ?? []);
    const [settingsSnapshot, customer, staff] = await Promise.all([
      this.store.doc('beautySettings', this.store.tenantId()).get(),
      this.linkedAccount('beautyCustomers', actor.userId, actor.phone),
      this.linkedAccount('beautyStaff', actor.userId),
    ]);
    const settings = settingsSnapshot.data() ?? {};
    const centerCode =
      typeof settings['centerCode'] === 'string'
        ? settings['centerCode']
        : centerCodeFor(this.store.tenantId());
    if (settings['centerCode'] !== centerCode) {
      await this.store
        .doc('beautySettings', this.store.tenantId())
        .set({ centerCode, updatedAt: new Date().toISOString() }, { merge: true });
    }
    const account = role === 'customer' ? customer : staff;
    const branchId = typeof account?.['branchId'] === 'string' ? account['branchId'] : null;
    const branchSnapshot = branchId ? await this.store.doc('beautyBranches', branchId).get() : null;

    return {
      uid: actor.userId,
      tenantId: actor.tenantId,
      tenantName:
        typeof settings['businessName'] === 'string'
          ? settings['businessName']
          : 'OdivonPro Beauty',
      centerCode,
      role,
      assigned: role !== null && (role !== 'customer' || customer !== null),
      displayName: actor.displayName ?? actor.email,
      email: actor.email,
      customerId: customer?.id ?? null,
      staffId: staff?.id ?? null,
      branchId,
      branchName:
        branchSnapshot?.exists && typeof branchSnapshot.data()?.['name'] === 'string'
          ? branchSnapshot.data()?.['name']
          : null,
      scopes: role ? beautyScopes(role) : [],
    };
  }

  async list(resource: string, query: BeautyListQueryDto) {
    const rows = await this.store.list(resource, query);
    const actor = this.store.actor();
    if (beautyRoleFor(actor.role, actor.roleIds ?? []) === 'customer' && resource === 'staff') {
      return rows.map((item) => ({
        id: item.id,
        name: item['name'] ?? item['fullName'] ?? 'Uzman',
        branchId: item['branchId'],
        serviceIds: item['serviceIds'] ?? [],
        status: item['status'] ?? 'active',
      }));
    }
    return rows;
  }
  get(resource: string, id: string) {
    return this.store.get(resource, id);
  }
  create(resource: string, dto: BeautyRecordDto, meta: AuditMeta) {
    return this.store.create(resource, dto.data, dto.branchId, meta);
  }
  update(resource: string, id: string, dto: BeautyRecordDto, meta: AuditMeta) {
    return this.store.update(resource, id, dto.data, meta);
  }
  remove(resource: string, id: string, meta: AuditMeta) {
    return this.store.remove(resource, id, meta);
  }

  async onboard(dto: BeautyOnboardingDto, meta: AuditMeta) {
    const actor = this.store.actor();
    if (actor.role !== 'owner')
      throw new PreconditionFailedException('Onboarding islemini yalniz tenant sahibi yapabilir.');
    const now = new Date().toISOString();
    const batch = this.store.db.batch();
    for (const role of BEAUTY_ROLES) {
      const ref = this.store.doc('roles', beautyRoleId(role));
      batch.set(
        ref,
        {
          ...createBaseFields(ref.id, actor.userId, now),
          name: role,
          product: 'beauty',
          permissions: BEAUTY_ROLE_PERMISSIONS[role],
        },
        { merge: true },
      );
    }
    const branchRef = this.store.newDoc('beautyBranches');
    batch.set(branchRef, {
      ...createBaseFields(branchRef.id, actor.userId, now),
      name: dto.branchName,
      active: true,
      timezone: dto.timezone,
      workDayStart: '09:00',
      workDayEnd: '21:00',
      workDays: [1, 2, 3, 4, 5, 6],
    });
    const settingsRef = this.store.doc('beautySettings', this.store.tenantId());
    batch.set(
      settingsRef,
      {
        ...createBaseFields(settingsRef.id, actor.userId, now),
        businessName: dto.businessName,
        timezone: dto.timezone,
        currency: 'TRY',
        locale: 'tr',
        centerCode: centerCodeFor(this.store.tenantId()),
        noShowConsumesSession: false,
        packageFreezeMaxDays: 60,
      },
      { merge: true },
    );
    await batch.commit();
    const result = {
      tenantId: this.store.tenantId(),
      branchId: branchRef.id,
      roles: BEAUTY_ROLES,
      status: 'ready',
    };
    await this.store.audit('onboarding', 'create', this.store.tenantId(), null, result, meta);
    return result;
  }

  async checkAvailability(dto: BeautyAvailabilityDto, ignoreId?: string) {
    const rows = await this.store.list('appointments', { branchId: dto.branchId, limit: 200 });
    const reason = conflictReason(dto, rows.filter((row) => row.id !== ignoreId).map(toRange));
    return { available: !reason, reason };
  }

  async createAppointment(dto: BeautyAppointmentDto, meta: AuditMeta) {
    if (new Date(dto.startAt).getTime() >= new Date(dto.endAt).getTime())
      throw new BadRequestException('endAt, startAt degerinden sonra olmalidir.');
    const duplicate = await this.idempotent(dto.idempotencyKey);
    if (duplicate) return duplicate;
    const [customer, staff] = await Promise.all([
      this.store.get('customers', dto.customerId),
      this.store.get('staff', dto.staffId),
    ]);
    if (customer['status'] === 'inactive')
      throw new PreconditionFailedException('Musteri aktif degil.');
    if (staff['status'] === 'inactive') throw new PreconditionFailedException('Uzman aktif degil.');
    for (const serviceId of dto.serviceIds) {
      const service = await this.store.get('services', serviceId);
      if (service['active'] === false) throw new PreconditionFailedException('Hizmet aktif degil.');
      const skills = Array.isArray(staff['serviceIds']) ? staff['serviceIds'] : [];
      if (skills.length && !skills.includes(serviceId))
        throw new PreconditionFailedException('Uzman bu hizmet icin yetkin degil.');
    }
    const availability = await this.checkAvailability(dto);
    if (!availability.available) throw new ConflictException(availability.reason);
    const appointment = await this.store.create(
      'appointments',
      {
        ...dto,
        status: dto.source === 'online' ? 'pending' : 'confirmed',
        remindersSent: [],
      },
      dto.branchId,
      meta,
    );
    await this.remember(dto.idempotencyKey, 'appointments', appointment.id, appointment);
    return appointment;
  }

  async setAppointmentStatus(
    id: string,
    status: string,
    reason: string | undefined,
    meta: AuditMeta,
  ) {
    const current = await this.store.get('appointments', id);
    const allowed: Record<string, readonly string[]> = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['checked-in', 'cancelled', 'no-show', 'rescheduled'],
      'checked-in': ['in-progress', 'cancelled'],
      'in-progress': ['completed'],
      rescheduled: ['confirmed', 'cancelled'],
    };
    if (!(allowed[String(current['status'])] ?? []).includes(status))
      throw new PreconditionFailedException('Gecersiz randevu durum gecisi.');
    return this.store.update(
      'appointments',
      id,
      { status, reason, [`${status}At`]: new Date().toISOString() },
      meta,
    );
  }

  async completeAppointment(id: string, dto: CompleteBeautySessionDto, meta: AuditMeta) {
    const duplicate = await this.idempotent(dto.idempotencyKey);
    if (duplicate) return duplicate;
    this.store.assertPermission('sessions', 'create');
    const appointmentRef = this.store.doc('beautyAppointments', id);
    const sessionRef = this.store.newDoc('beautySessions');
    const actor = this.store.actor();
    const result = await this.store.runTransaction(async (tx) => {
      const appointmentSnap = await tx.get(appointmentRef);
      if (!appointmentSnap.exists || isDeleted(appointmentSnap.data() as BeautyDoc))
        throw new NotFoundException('Randevu bulunamadi.');
      const appointment = { id: appointmentSnap.id, ...appointmentSnap.data() } as BeautyDoc;
      if (appointment['status'] === 'completed')
        throw new PreconditionFailedException('Randevu daha once tamamlandi.');
      const packageId =
        dto.customerPackageId ??
        (typeof appointment['customerPackageId'] === 'string'
          ? appointment['customerPackageId']
          : undefined);
      const packageRef = packageId ? this.store.doc('beautyCustomerPackages', packageId) : null;
      const packageSnap = packageRef ? await tx.get(packageRef) : null;
      const productRefs = dto.products.map((item) =>
        this.store.doc('beautyProducts', item.productId),
      );
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));
      const now = new Date().toISOString();
      let sessionNumber = 1;
      if (packageRef && packageSnap?.exists) {
        const pkg = packageSnap.data() as BeautyDoc;
        const remaining = number(pkg['remainingSessions']);
        if (remaining <= 0 || pkg['status'] !== 'active' || pkg['frozen'] === true)
          throw new PreconditionFailedException('Paket seansi kullanilamaz.');
        sessionNumber = number(pkg['usedSessions']) + 1;
        const interval = number(pkg['sessionIntervalDays'], 28);
        tx.update(packageRef, {
          usedSessions: sessionNumber,
          remainingSessions: remaining - 1,
          lastSessionAt: now,
          nextSessionDueAt: nextSessionDue(now, interval),
          status: remaining - 1 === 0 ? 'completed' : 'active',
          ...touchBaseFields(actor.userId),
        });
      }
      const session = {
        ...createBaseFields(sessionRef.id, actor.userId, now),
        appointmentId: id,
        customerId: appointment['customerId'],
        branchId: appointment['branchId'],
        staffId: appointment['staffId'],
        customerPackageId: packageId ?? '',
        sessionNumber,
        ...dto,
        performedBy: actor.userId,
        performedAt: now,
      };
      tx.set(sessionRef, session);
      tx.update(appointmentRef, {
        status: 'completed',
        completedAt: now,
        sessionId: sessionRef.id,
        ...touchBaseFields(actor.userId),
      });
      dto.products.forEach((item, index) => {
        const product = productSnaps[index];
        if (!product.exists) throw new NotFoundException(`Urun bulunamadi: ${item.productId}`);
        const onHand = number(product.data()?.['stockQuantity']);
        if (onHand < item.quantity) throw new PreconditionFailedException('Yetersiz stok.');
        tx.update(productRefs[index], {
          stockQuantity: onHand - item.quantity,
          ...touchBaseFields(actor.userId),
        });
        const movement = this.store.newDoc('beautyInventoryTransactions');
        tx.set(movement, {
          ...createBaseFields(movement.id, actor.userId, now),
          branchId: appointment['branchId'],
          productId: item.productId,
          quantity: -item.quantity,
          type: 'consumption',
          sessionId: sessionRef.id,
        });
      });
      const rate = number(appointment['commissionRate']);
      if (rate > 0) {
        const commission = this.store.newDoc('beautyCommissions');
        tx.set(commission, {
          ...createBaseFields(commission.id, actor.userId, now),
          branchId: appointment['branchId'],
          staffId: appointment['staffId'],
          sessionId: sessionRef.id,
          amount: commissionAmount(number(appointment['totalAmount']), rate),
          rate,
          status: 'accrued',
        });
      }
      return session;
    });
    await this.store.audit('appointments', 'complete', id, null, result, meta);
    await this.remember(dto.idempotencyKey, 'sessions', String(result.id), result);
    return result;
  }

  async createPayment(dto: BeautyPaymentDto, meta: AuditMeta) {
    const duplicate = await this.idempotent(dto.idempotencyKey);
    if (duplicate) return duplicate;
    const openDays = await this.store.list('cash-register-days', {
      branchId: dto.branchId,
      status: 'open',
      limit: 10,
    });
    if (!openDays.length)
      throw new PreconditionFailedException('Odeme almak icin kasa vardiyasi acik olmalidir.');
    const payment = await this.store.create(
      'payments',
      { ...dto, status: 'paid', tip: dto.tip ?? 0 },
      dto.branchId,
      meta,
    );
    if (dto.staffId && (dto.commissionRate ?? 0) > 0) {
      await this.store.create(
        'commissions',
        {
          staffId: dto.staffId,
          paymentId: payment.id,
          amount: commissionAmount(dto.amount, dto.commissionRate ?? 0),
          rate: dto.commissionRate,
          status: 'accrued',
        },
        dto.branchId,
        meta,
      );
    }
    await this.remember(dto.idempotencyKey, 'payments', payment.id, payment);
    return payment;
  }

  async refundPayment(id: string, dto: BeautyRefundDto, meta: AuditMeta) {
    const duplicate = await this.idempotent(dto.idempotencyKey);
    if (duplicate) return duplicate;
    const original = await this.store.get('payments', id);
    if (dto.amount > number(original['amount']))
      throw new BadRequestException('Iade tutari odemeyi asamaz.');
    const refund = await this.store.create(
      'payments',
      {
        branchId: original['branchId'],
        customerId: original['customerId'],
        amount: -dto.amount,
        method: original['method'],
        status: 'refunded',
        refundedPaymentId: id,
        reason: dto.reason,
      },
      String(original['branchId']),
      meta,
    );
    await this.store.update(
      'payments',
      id,
      { refundedAmount: number(original['refundedAmount']) + dto.amount },
      meta,
    );
    await this.remember(dto.idempotencyKey, 'payments', refund.id, refund);
    return refund;
  }

  async dashboard(branchId?: string) {
    const actor = this.store.actor();
    const role = beautyRoleFor(actor.role, actor.roleIds ?? []);
    const appointments = await this.store.list('appointments', { branchId, limit: 200 });
    const customers =
      role === 'customer'
        ? await this.store.list('customers', { branchId, limit: 1 })
        : await this.store.list('customers', { branchId, limit: 200 });
    const payments =
      role === 'customer' || role === 'specialist'
        ? []
        : await this.store.list('payments', { branchId, limit: 200 });
    const products =
      role === 'customer' || role === 'cashier'
        ? []
        : await this.store.list('products', { branchId, limit: 200 });
    const sessions = await this.store.list('sessions', { branchId, limit: 200 });
    const consultations =
      role === 'customer'
        ? []
        : await this.store.list('consultations', { branchId, limit: 200 });
    const packages =
      role === 'customer'
        ? await this.store.list('customer-packages', { branchId, limit: 200 })
        : [];
    return {
      appointments: appointments.length,
      customers: customers.length,
      revenue: payments.reduce((sum, item) => sum + number(item['amount']), 0),
      criticalStock: products.filter(
        (item) => number(item['stockQuantity']) <= number(item['criticalStock']),
      ).length,
      sessions: sessions.length,
      packages: packages.filter((item) => item['status'] === 'active').length,
      consultations: consultations.length,
      leads: consultations.length,
    };
  }

  recommendation(dto: BeautyRecommendationDto) {
    this.store.assertPermission('health', 'view');
    return {
      status: 'not-configured',
      provider: null,
      requiresSpecialistApproval: true,
      input: dto,
      draft: {
        title: 'Nem bariyeri odakli protokol',
        steps: ['Uzman cilt analizi', 'Nazik bakim seansi', '28 gun sonra kontrol'],
        warnings: ['Kontrendikasyonlar uzman tarafindan dogrulanmalidir.'],
      },
    };
  }

  private async linkedAccount(collection: string, userId: string, phone?: string | null) {
    const linked = await this.store
      .collection(collection)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    if (!linked.empty) {
      const document = linked.docs[0];
      return { id: document.id, ...document.data() } as BeautyDoc;
    }
    if (collection !== 'beautyCustomers' || !phone) return null;
    const byPhone = await this.store
      .collection(collection)
      .where('phone', '==', phone)
      .limit(2)
      .get();
    if (byPhone.size !== 1) return null;
    const document = byPhone.docs[0];
    await document.ref.update({ userId, updatedAt: new Date().toISOString() });
    return { id: document.id, ...document.data(), userId } as BeautyDoc;
  }

  async createPublicToken(appointmentId: string) {
    const token = randomBytes(24).toString('base64url');
    await this.store.update('appointments', appointmentId, {
      publicTokenHash: createHash('sha256').update(token).digest('hex'),
    });
    return token;
  }

  private async idempotent(key?: string): Promise<BeautyDoc | null> {
    if (!key) return null;
    const snapshot = await this.store.doc('beautyIdempotency', key).get();
    return snapshot.exists ? (snapshot.data() as BeautyDoc) : null;
  }

  private async remember(
    key: string | undefined,
    resource: string,
    entityId: string,
    result: unknown,
  ) {
    if (!key) return;
    await this.store
      .doc('beautyIdempotency', key)
      .set({ id: key, resource, entityId, result, createdAt: new Date().toISOString() });
  }
}

function beautyRoleFor(platformRole: string, roleIds: readonly string[]): BeautyRole | null {
  if (platformRole === 'owner') return 'owner';
  for (const role of BEAUTY_ROLES) {
    if (roleIds.includes(beautyRoleId(role))) return role;
  }
  return null;
}

function beautyScopes(role: BeautyRole): string[] {
  if (role === 'customer')
    return ['own-customer', 'own-appointments', 'own-sessions', 'own-packages', 'own-wallet', 'own-installments', 'own-consultations'];
  if (role === 'specialist') return ['own-appointments', 'own-sessions', 'own-commissions'];
  return ['tenant'];
}

function centerCodeFor(tenantId: string): string {
  return `BY-${createHash('sha256').update(tenantId).digest('hex').slice(0, 6).toUpperCase()}`;
}

function toRange(doc: BeautyDoc) {
  return {
    startAt: String(doc['startAt']),
    endAt: String(doc['endAt']),
    staffId: stringValue(doc['staffId']),
    roomId: stringValue(doc['roomId']),
    deviceId: stringValue(doc['deviceId']),
    customerId: stringValue(doc['customerId']),
    status: stringValue(doc['status']),
  };
}
function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
function number(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

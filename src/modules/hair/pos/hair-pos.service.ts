import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { DocumentReference } from 'firebase-admin/firestore';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { HairNotificationsService } from '../notifications/hair-notifications.service';
import { addDays, isOpenStatus } from '../shared/appointment-plan';
import { assertCashAllowed } from '../shared/cash-register';
import {
  CustomerPackageRecord,
  MONEY_EPSILON,
  PackagePlanRecord,
  priceCheckout,
  ProductRecord,
  ServiceRecord,
  StaffRecord,
} from '../shared/checkout-pricing';
import { CommissionRuleRecord } from '../shared/commission-engine';
import { assertDiscountLimit, discountLimitFor } from '../shared/discount-limit';
import { hairForbidden, hairInvalid, hairNotFound, hairPrecondition } from '../shared/hair-errors';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { assertPayments, PaymentLine, PaymentMethod, round2 } from '../shared/hair-money';
import { HairStaffRole } from '../shared/hair-roles';
import { idempotency } from '../shared/hair-idempotency';
import { HairDoc, HairStore } from '../shared/hair-store';
import { dateIdInTz, dateStampInTz } from '../shared/hair-time';
import { fullName, live, num, str, toMap, unique } from '../shared/hair-tx';
import { CheckoutDto, RefundSessionDto } from './pos.dto';

const SESSION_NOT_FOUND = 'İşlem bulunamadı.';
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
/** Roles that may give money back (V-003). */
const REFUND_ROLES: readonly HairStaffRole[] = ['admin', 'manager'];

interface LowStock {
  productId: string;
  name: string;
  stock: number;
  minStock: number;
}

@Injectable()
export class HairPosService {
  constructor(
    private readonly store: HairStore,
    private readonly notifications: HairNotificationsService,
  ) {}

  async listSessions(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    const branch = this.store.branchFilter(actor, query.branchId);
    return this.store.list(TENANT_COLLECTION.hairSessions, {
      dateField: 'date',
      from: query.from,
      to: query.to ? addDays(query.to, 1) : undefined,
      equals: { branchId: branch.equals, customerId: query.customerId, staffId: query.staffId, status: query.status },
      anyOf: branch.anyOf ? { field: 'branchId', values: branch.anyOf } : undefined,
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  async getSession(id: string) {
    const actor = await this.store.actorOrThrow();
    const session = await this.store.getOrThrow(TENANT_COLLECTION.hairSessions, id, SESSION_NOT_FOUND);
    this.store.assertBranchAccess(actor, str(session['branchId']));
    return session;
  }

  /**
   * POS checkout in ONE transaction (plan §11.4): all reads first (idempotency key, catalog, stock,
   * packages, rules, appointment, cash register), pure pricing, then every write — session, payment,
   * stock + inventory transactions, package balances / sales, commissions, appointment completion
   * (P-006) and customer statistics. A retry with the same idempotency key returns the first session.
   */
  async checkout(dto: CheckoutDto) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, dto.branchId);
    const payments = assertPayments(dto.payments ?? [], { allowEmpty: true });
    const settings = await this.store.settings();
    const discountLimit = discountLimitFor(actor.role, settings.maxDiscountPercent);
    const timeZone = await this.store.timeZone();
    const today = dateIdInTz(timeZone);
    const userId = this.store.userId();
    const ref = (name: string, id: string) => this.store.ref(name, id);

    const outcome = await this.store.runTransaction(async (tx) => {
      // ---- Reads ----
      const idemRef = ref(TENANT_COLLECTION.hairIdempotency, dto.idempotencyKey);
      const idem = await tx.get(idemRef);
      if (idem.exists) {
        const previous = live(await tx.get(ref(TENANT_COLLECTION.hairSessions, str(idem.data()?.['sessionId']))));
        if (previous) return { session: previous, replay: true, lowStock: [] as LowStock[] };
      }

      const branch = live(await tx.get(ref(TENANT_COLLECTION.hairBranches, dto.branchId)));
      if (!branch) throw hairNotFound('Şube bulunamadı.');
      const customer = live(await tx.get(ref(TENANT_COLLECTION.hairCustomers, dto.customerId)));
      if (!customer) throw hairNotFound('Müşteri bulunamadı.');

      const staffIds = unique([dto.staffId, ...dto.items.flatMap((i) => (i.staffId ? [i.staffId] : []))]);
      const serviceIds = unique(dto.items.filter((i) => i.type === 'service').map((i) => i.refId));
      const planIds = unique(dto.items.filter((i) => i.type === 'package').map((i) => i.refId));
      const customerPackageIds = unique(dto.items.flatMap((i) => (i.customerPackageId ? [i.customerPackageId] : [])));
      const [staffSnaps, serviceSnaps, planSnaps, packageSnaps, rulesSnap] = await Promise.all([
        Promise.all(staffIds.map((id) => tx.get(ref(TENANT_COLLECTION.hairStaff, id)))),
        Promise.all(serviceIds.map((id) => tx.get(ref(TENANT_COLLECTION.hairServices, id)))),
        Promise.all(planIds.map((id) => tx.get(ref(TENANT_COLLECTION.hairPackages, id)))),
        Promise.all(customerPackageIds.map((id) => tx.get(ref(TENANT_COLLECTION.hairCustomerPackages, id)))),
        tx.get(this.store.collection(TENANT_COLLECTION.hairCommissionRules).where('active', '==', true)),
      ]);
      const services = toMap(serviceSnaps);
      const consumableIds = [...services.values()].flatMap((s) =>
        Array.isArray(s['productsUsed']) ? (s['productsUsed'] as { productId: string }[]).map((u) => u.productId) : [],
      );
      const productIds = unique([
        ...dto.items.filter((i) => i.type === 'product').map((i) => i.refId),
        ...consumableIds,
      ]);
      const productSnaps = await Promise.all(productIds.map((id) => tx.get(ref(TENANT_COLLECTION.hairProducts, id))));
      const products = toMap(productSnaps);

      let appointment: HairDoc | null = null;
      if (dto.appointmentId) {
        appointment = live(await tx.get(ref(TENANT_COLLECTION.hairAppointments, dto.appointmentId)));
        if (!appointment) throw hairNotFound('Randevu bulunamadı.');
        if (appointment['customerId'] !== dto.customerId) throw hairPrecondition('Randevu bu müşteriye ait değil.');
        if (!isOpenStatus(appointment['status'])) {
          throw hairPrecondition('Bu randevu zaten kapatılmış (tamamlandı, iptal veya gelmedi).');
        }
      }
      await assertCashAllowed(tx, this.store, dto.branchId, today, payments);
      const counterRef = ref(TENANT_COLLECTION.hairCounters, 'sessions');
      const counterSnap = await tx.get(counterRef);

      const staffDocs = toMap(staffSnaps);
      const plans = toMap(planSnaps);
      const customerPackages = toMap(packageSnaps);
      const priced = priceCheckout({
        customerId: dto.customerId,
        staffId: dto.staffId,
        items: dto.items,
        payments,
        globalDiscount: dto.globalDiscount ?? 0,
        services: mapValues(services, (s): ServiceRecord => ({
          name: str(s['name']),
          price: num(s['price']),
          categoryId: str(s['categoryId']) || null,
          vatRate: num(s['vatRate']),
          productsUsed: Array.isArray(s['productsUsed']) ? (s['productsUsed'] as ServiceRecord['productsUsed']) : [],
        })),
        products: mapValues(products, (p): ProductRecord => ({
          name: str(p['name']),
          salePrice: num(p['salePrice']),
          currentStock: num(p['currentStock']),
          vatRate: num(p['vatRate']),
        })),
        packagePlans: mapValues(plans, (p): PackagePlanRecord => ({
          name: str(p['name']),
          price: num(p['price']),
          active: p['active'] !== false,
          totalSessions: num(p['totalSessions']),
          validityDays: num(p['validityDays']),
          services: Array.isArray(p['services']) ? (p['services'] as { serviceId: string }[]) : [],
        })),
        customerPackages: mapValues(customerPackages, (p): CustomerPackageRecord => ({
          customerId: str(p['customerId']),
          packageId: str(p['packageId']),
          remainingSessions: num(p['remainingSessions']),
          status: str(p['status']),
          endDate: str(p['endDate']) || null,
          services: Array.isArray(p['services']) ? (p['services'] as { serviceId: string }[]) : [],
        })),
        staff: mapValues(staffDocs, (s): StaffRecord => ({
          name: fullName(s),
          defaultCommissionPercent: num(s['defaultCommissionPercent']),
        })),
        rules: rulesSnap.docs
          .map((doc) => ({ ...doc.data(), id: doc.id }) as HairDoc)
          .filter((rule) => !rule.deletedAt) as unknown as CommissionRuleRecord[],
        today,
      });
      assertDiscountLimit(priced.resolvedItems, priced.subtotal, dto.globalDiscount ?? 0, discountLimit);

      // ---- Writes ----
      const now = new Date().toISOString();
      const stamp = (docRef: DocumentReference, fields: object) => ({
        ...createBaseFields(docRef.id, userId, now),
        ...stripUndefined(fields),
      });
      const sessionRef = this.store.newRef(TENANT_COLLECTION.hairSessions);
      const nextSeq = num(counterSnap.data()?.['value']) + 1;
      const receiptNo = `H-${dateStampInTz(timeZone)}-${String(nextSeq).padStart(4, '0')}`;
      const customerName = fullName(customer);
      const staffName = fullName(staffDocs.get(dto.staffId));
      tx.set(counterRef, { value: nextSeq }, { merge: true });

      const lowStock: LowStock[] = [];
      for (const [productId, qty] of priced.productDecrements) {
        const product = products.get(productId)!;
        const stockAfter = round3(num(product['currentStock']) - qty);
        tx.update(ref(TENANT_COLLECTION.hairProducts, productId), { currentStock: stockAfter, updatedAt: now, updatedBy: userId });
        const consumed = priced.consumableDecrements.get(productId) ?? 0;
        const txRef = this.store.newRef(TENANT_COLLECTION.hairInventoryTransactions);
        tx.set(txRef, stamp(txRef, {
          productId,
          productName: str(product['name']),
          type: 'out',
          quantity: qty,
          delta: -qty,
          stockAfter,
          reason: consumed === qty ? 'Hizmette kullanım' : 'Satış',
          sessionId: sessionRef.id,
          branchId: dto.branchId,
          date: today,
        }));
        if (stockAfter <= num(product['minStock'])) {
          lowStock.push({ productId, name: str(product['name']), stock: stockAfter, minStock: num(product['minStock']) });
        }
      }
      for (const [packageId, qty] of priced.packageDecrements) {
        const pkg = customerPackages.get(packageId)!;
        const remaining = num(pkg['remainingSessions']) - qty;
        tx.update(ref(TENANT_COLLECTION.hairCustomerPackages, packageId), {
          remainingSessions: remaining,
          ...(remaining === 0 ? { status: 'completed' } : {}),
          updatedAt: now,
          updatedBy: userId,
        });
      }
      const soldPackageIds: string[] = [];
      for (const [planId, count] of priced.packageSales) {
        const plan = plans.get(planId)!;
        for (let i = 0; i < count; i++) {
          const pkgRef = this.store.newRef(TENANT_COLLECTION.hairCustomerPackages);
          soldPackageIds.push(pkgRef.id);
          tx.set(pkgRef, stamp(pkgRef, {
            customerId: dto.customerId,
            customerName,
            packageId: planId,
            packageName: str(plan['name']),
            services: Array.isArray(plan['services']) ? plan['services'] : [],
            totalSessions: num(plan['totalSessions']),
            remainingSessions: num(plan['totalSessions']),
            price: num(plan['price']),
            status: 'active',
            startDate: today,
            endDate: addDays(today, num(plan['validityDays'])),
            branchId: dto.branchId,
            sessionId: sessionRef.id,
          }));
        }
      }
      const commissions = priced.commissionLines.map((line) => {
        const commissionRef = this.store.newRef(TENANT_COLLECTION.hairCommissions);
        tx.set(commissionRef, stamp(commissionRef, {
          ...line,
          sessionId: sessionRef.id,
          branchId: dto.branchId,
          date: today,
          payoutStatus: 'unpaid',
        }));
        return { id: commissionRef.id, staffId: line.staffId, staffName: line.staffName, amount: line.amount };
      });
      let paymentId: string | null = null;
      if (payments.length > 0) {
        const paymentRef = this.store.newRef(TENANT_COLLECTION.hairPayments);
        paymentId = paymentRef.id;
        tx.set(paymentRef, stamp(paymentRef, {
          sessionId: sessionRef.id,
          appointmentId: dto.appointmentId ?? null,
          customerId: dto.customerId,
          customerName,
          branchId: dto.branchId,
          staffId: dto.staffId,
          staffName,
          lines: payments,
          totalAmount: priced.totalAmount,
          date: today,
          isRefund: false,
        }));
      }
      if (appointment) {
        tx.update(ref(TENANT_COLLECTION.hairAppointments, appointment.id), {
          status: 'completed',
          sessionId: sessionRef.id,
          completedAt: now,
          updatedAt: now,
          updatedBy: userId,
        });
      }
      tx.update(ref(TENANT_COLLECTION.hairCustomers, dto.customerId), {
        totalVisits: num(customer['totalVisits']) + 1,
        totalSpent: round2(num(customer['totalSpent']) + priced.totalAmount),
        lastVisitDate: today,
        updatedAt: now,
      });

      const session = stamp(sessionRef, {
        receiptNo,
        appointmentId: dto.appointmentId ?? null,
        customerId: dto.customerId,
        customerName,
        branchId: dto.branchId,
        staffId: dto.staffId,
        staffName,
        items: priced.resolvedItems,
        subtotal: priced.subtotal,
        globalDiscount: dto.globalDiscount ?? 0,
        totalAmount: priced.totalAmount,
        vatTotal: priced.vatTotal,
        payments,
        paymentId,
        commissions,
        productDecrements: [...priced.productDecrements].map(([productId, qty]) => ({
          productId,
          productName: str(products.get(productId)?.['name']),
          qty,
        })),
        packageDecrements: [...priced.packageDecrements].map(([packageId, qty]) => ({ packageId, qty })),
        soldPackageIds,
        refunds: [],
        refundedAmount: 0,
        date: today,
        idempotencyKey: dto.idempotencyKey,
        status: 'completed',
        notes: dto.notes,
      }) as HairDoc;
      tx.set(sessionRef, session);
      tx.set(idemRef, {
        sessionId: sessionRef.id,
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
      });
      return { session, replay: false, lowStock };
    });

    if (!outcome.replay) {
      await this.store.audit('hairSessions', 'callable', outcome.session.id, null, {
        receiptNo: outcome.session['receiptNo'],
        totalAmount: outcome.session['totalAmount'],
      });
      for (const item of outcome.lowStock) {
        await this.notifications.notifyStaff({
          branchId: dto.branchId,
          type: 'lowStock',
          title: 'Düşük stok',
          body: `${item.name}: stok ${item.stock} (eşik ${item.minStock})`,
          link: `/inventory?productId=${item.productId}`,
        });
      }
    }
    return outcome.session;
  }

  /**
   * Full or partial refund (V-003). Money goes back as a negative payment and commissions are
   * reversed pro rata; when the session becomes fully refunded, stock, redeemed package sessions,
   * sold packages and the customer's visit counter are reversed too — all in one transaction.
   */
  async refund(sessionId: string, dto: RefundSessionDto) {
    const actor = await this.store.actorOrThrow();
    if (!REFUND_ROLES.includes(actor.role)) {
      throw hairForbidden('İade yalnızca yönetici veya müdür tarafından yapılabilir.');
    }
    const sessionRef = this.store.ref(TENANT_COLLECTION.hairSessions, sessionId);
    const timeZone = await this.store.timeZone();
    const today = dateIdInTz(timeZone);
    const userId = this.store.userId();
    const requestedLines = dto.lines?.length ? dto.lines : dto.payments;

    const result = await this.store.runTransaction(async (tx) => {
      const idem = await idempotency<HairDoc>(tx, this.store, `refund_${sessionId}`, dto.idempotencyKey, dto);
      if (idem.replay) return { session: idem.replay, amount: 0, becomesFull: false, replay: true };
      const session = live(await tx.get(sessionRef));
      if (!session) throw hairNotFound(SESSION_NOT_FOUND);
      this.store.assertBranchAccess(actor, str(session['branchId']));
      if (session['status'] === 'refunded') throw hairPrecondition('Bu işlem zaten tamamen iade edilmiş.');
      const total = num(session['totalAmount']);
      const refundedBefore = num(session['refundedAmount']);
      const originalLines = Array.isArray(session['payments']) ? (session['payments'] as PaymentLine[]) : [];
      const previous = Array.isArray(session['refunds']) ? (session['refunds'] as { lines?: PaymentLine[] }[]) : [];
      // What can still go back, in total and per original payment method.
      const available = refundableByMethod(originalLines, previous);
      const paid = round2(originalLines.reduce((sum, line) => sum + line.amount, 0));
      const refundable = round2(Math.max(0, Math.min(total, paid) - refundedBefore));
      const explicit = requestedLines?.length ? assertPayments(requestedLines) : null;
      const amount = round2(dto.amount ?? (explicit ? sumLines(explicit) : refundable));
      if (amount <= 0 && refundable > 0) throw hairInvalid('İade tutarı sıfırdan büyük olmalıdır.');
      if (amount > refundable + MONEY_EPSILON) {
        throw new AppException(ErrorCode.REFUND_LIMIT, `En fazla ${refundable} iade edilebilir (ödenen − iade edilen).`, {
          refundable,
        });
      }
      const becomesFull = Math.abs(refundable - amount) <= MONEY_EPSILON;
      const lines = explicit ?? defaultRefundLines(available, amount);
      if (Math.abs(sumLines(lines) - amount) > MONEY_EPSILON) {
        throw hairInvalid('İade ödeme satırlarının toplamı iade tutarına eşit olmalı.');
      }
      for (const [method, requested] of sumByMethod(lines)) {
        const left = available.get(method) ?? 0;
        if (requested > left + MONEY_EPSILON) {
          throw new AppException(ErrorCode.REFUND_LIMIT, `"${method}" yöntemiyle en fazla ${left} iade edilebilir.`, {
            method,
            refundable: left,
          });
        }
      }
      const branchId = str(session['branchId']);
      await assertCashAllowed(tx, this.store, branchId, today, lines);

      const customerRef = this.store.ref(TENANT_COLLECTION.hairCustomers, str(session['customerId']));
      const customer = live(await tx.get(customerRef));
      const commissionsSnap = await tx.get(
        this.store.collection(TENANT_COLLECTION.hairCommissions).where('sessionId', '==', sessionId),
      );
      const restock = becomesFull && dto.restock !== false;
      const decrements = Array.isArray(session['productDecrements'])
        ? (session['productDecrements'] as { productId: string; productName?: string; qty: number }[])
        : [];
      const productSnaps = restock
        ? await Promise.all(decrements.map((d) => tx.get(this.store.ref(TENANT_COLLECTION.hairProducts, d.productId))))
        : [];
      const packageDecrements = Array.isArray(session['packageDecrements'])
        ? (session['packageDecrements'] as { packageId: string; qty: number }[])
        : [];
      const packageSnaps = becomesFull
        ? await Promise.all(packageDecrements.map((d) => tx.get(this.store.ref(TENANT_COLLECTION.hairCustomerPackages, d.packageId))))
        : [];
      const soldIds = Array.isArray(session['soldPackageIds']) ? (session['soldPackageIds'] as string[]) : [];
      const soldSnaps = becomesFull
        ? await Promise.all(soldIds.map((id) => tx.get(this.store.ref(TENANT_COLLECTION.hairCustomerPackages, id))))
        : [];

      // ---- Writes ----
      const now = new Date().toISOString();
      const stamp = (docRef: DocumentReference, fields: object) => ({
        ...createBaseFields(docRef.id, userId, now),
        ...stripUndefined(fields),
      });
      const refundRef = this.store.newRef(TENANT_COLLECTION.hairPayments);
      if (amount > 0) {
        tx.set(refundRef, stamp(refundRef, {
          sessionId,
          customerId: session['customerId'],
          customerName: session['customerName'],
          branchId,
          staffId: session['staffId'],
          staffName: session['staffName'],
          lines: lines.map((line) => ({ ...line, amount: -line.amount })),
          totalAmount: -amount,
          date: today,
          isRefund: true,
          notes: dto.reason,
        }));
      }
      // Commissions shrink in proportion to the refund; the final refund reverses whatever is left.
      const ratio = total > 0 ? amount / total : 1;
      const reversedSoFar = new Map<string, number>();
      for (const doc of commissionsSnap.docs) {
        const row = doc.data() as HairDoc;
        const of = str(row['reversalOf']);
        if (of && !row.deletedAt) reversedSoFar.set(of, (reversedSoFar.get(of) ?? 0) + num(row['amount']));
      }
      for (const doc of commissionsSnap.docs) {
        const commission = doc.data() as HairDoc;
        if (commission.deletedAt || commission['reversalOf'] || num(commission['amount']) <= 0) continue;
        const outstanding = num(commission['amount']) + (reversedSoFar.get(doc.id) ?? 0);
        const reversal = round2(becomesFull ? -outstanding : Math.max(-outstanding, -num(commission['amount']) * ratio));
        if (reversal === 0) continue;
        const reversalRef = this.store.newRef(TENANT_COLLECTION.hairCommissions);
        tx.set(reversalRef, stamp(reversalRef, {
          sessionId,
          staffId: commission['staffId'],
          staffName: commission['staffName'],
          serviceId: commission['serviceId'],
          serviceName: commission['serviceName'],
          branchId,
          basisAmount: 0,
          amount: reversal,
          date: today,
          payoutStatus: 'unpaid',
          reversalOf: doc.id,
          refundId: refundRef.id,
        }));
      }
      if (restock) {
        decrements.forEach((d, index) => {
          const product = live(productSnaps[index]);
          if (!product) return;
          const stockAfter = round3(num(product['currentStock']) + d.qty);
          tx.update(productSnaps[index].ref, { currentStock: stockAfter, updatedAt: now, updatedBy: userId });
          const txRef = this.store.newRef(TENANT_COLLECTION.hairInventoryTransactions);
          tx.set(txRef, stamp(txRef, {
            productId: d.productId,
            productName: str(product['name']),
            type: 'in',
            quantity: d.qty,
            delta: d.qty,
            stockAfter,
            reason: 'İade',
            sessionId,
            branchId,
            date: today,
          }));
        });
      }
      if (becomesFull) {
        packageDecrements.forEach((d, index) => {
          const pkg = live(packageSnaps[index]);
          if (!pkg) return;
          tx.update(packageSnaps[index].ref, {
            remainingSessions: num(pkg['remainingSessions']) + d.qty,
            ...(pkg['status'] === 'completed' ? { status: 'active' } : {}),
            updatedAt: now,
            updatedBy: userId,
          });
        });
        soldSnaps.forEach((snap) => {
          if (live(snap)) tx.update(snap.ref, { status: 'cancelled', updatedAt: now, updatedBy: userId });
        });
      }
      if (customer) {
        tx.update(customerRef, {
          totalSpent: round2(Math.max(0, num(customer['totalSpent']) - amount)),
          ...(becomesFull ? { totalVisits: Math.max(0, num(customer['totalVisits']) - 1) } : {}),
          updatedAt: now,
        });
      }
      const refunds = Array.isArray(session['refunds']) ? (session['refunds'] as object[]) : [];
      const updated = {
        ...session,
        refunds: [...refunds, { refundId: refundRef.id, amount, lines, reason: dto.reason, at: now, by: userId }],
        refundedAmount: round2(refundedBefore + amount),
        status: becomesFull ? 'refunded' : 'partialRefund',
        updatedAt: now,
        updatedBy: userId,
      };
      tx.set(sessionRef, updated);
      idem.save(updated as HairDoc);
      return { session: updated as HairDoc, amount, becomesFull, replay: false };
    });

    if (!result.replay) {
      await this.store.audit('hairSessions', 'callable', sessionId, null, {
        refund: result.amount,
        status: result.session['status'],
      });
    }
    return result.session;
  }
}

/** Refund back through the original methods, largest payment first. */
function defaultRefundLines(available: Map<PaymentMethod, number>, amount: number): PaymentLine[] {
  if (amount <= 0) return [];
  const lines: PaymentLine[] = [];
  let left = amount;
  for (const [method, max] of [...available].sort((a, b) => b[1] - a[1])) {
    if (left <= 0) break;
    const take = round2(Math.min(left, max));
    if (take > 0) lines.push({ method, amount: take });
    left = round2(left - take);
  }
  return lines;
}

function sumLines(lines: PaymentLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.amount, 0));
}

function sumByMethod(lines: PaymentLine[]): Map<PaymentMethod, number> {
  const totals = new Map<PaymentMethod, number>();
  for (const line of lines) totals.set(line.method, round2((totals.get(line.method) ?? 0) + line.amount));
  return totals;
}

/** Paid minus already refunded, per original payment method (older refunds without lines are ignored). */
function refundableByMethod(original: PaymentLine[], refunds: { lines?: PaymentLine[] }[]): Map<PaymentMethod, number> {
  const available = sumByMethod(original);
  for (const refund of refunds) {
    for (const line of refund.lines ?? []) {
      available.set(line.method, round2((available.get(line.method) ?? 0) - Math.abs(line.amount)));
    }
  }
  return available;
}

function mapValues<T>(source: Map<string, HairDoc>, fn: (doc: HairDoc) => T): Map<string, T> {
  return new Map([...source].map(([key, doc]) => [key, fn(doc)]));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function stripUndefined(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined));
}


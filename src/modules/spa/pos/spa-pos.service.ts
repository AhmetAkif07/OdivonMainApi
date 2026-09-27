import { Injectable } from '@nestjs/common';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import { OPEN_APPOINTMENT_STATUSES, AppointmentStatus } from '../appointments/appointment.dto';
import { assertCashDayOpen } from '../shared/cash-day';
import {
  CustomerPackageRecord,
  priceCheckout,
  ProductRecord,
  ServiceRecord,
} from '../shared/checkout-pricing';
import { CommissionRuleRecord } from '../shared/commission-engine';
import { spaInvalid, spaNotFound, spaPrecondition } from '../shared/spa-errors';
import { assertPayments } from '../shared/spa-money';
import { SpaDoc, SpaStore } from '../shared/spa-store';
import { dateStampInTz } from '../shared/spa-time';
import { CheckoutSessionDto } from './pos.dto';

@Injectable()
export class SpaPosService {
  constructor(private readonly store: SpaStore) {}

  /**
   * One transaction: prices the lines, decrements stock and package balances, writes the session,
   * commission accruals and a sequential receipt number, and completes the appointment.
   */
  async checkout(dto: CheckoutSessionDto) {
    for (const item of dto.items) {
      if (item.customerPackageId && item.kind !== 'service') {
        throw spaInvalid('Paket kullanımı yalnızca hizmet satırında yapılabilir.');
      }
    }
    // A fully package-redeemed session has nothing to charge, so an empty payments list is valid.
    const payments = assertPayments(dto.payments ?? [], { allowEmpty: true });
    const globalDiscount = dto.discountAmount ?? 0;
    const timeZone = await this.store.timeZone();
    const userId = this.store.userId();
    const ref = (name: string, id: string) => this.store.doc(name, id);

    const result = await this.store.runTransaction(async (tx) => {
      // ---- Reads ----
      await assertCashDayOpen(tx, this.store, timeZone);
      const staff = live(await tx.get(ref(TENANT_COLLECTION.spaStaff, dto.staffId)));
      if (!staff) throw spaNotFound('Terapist bulunamadı.');

      const serviceIds = unique(dto.items.filter((i) => i.kind === 'service').map((i) => i.refId));
      const productIds = unique(dto.items.filter((i) => i.kind === 'product').map((i) => i.refId));
      const packageIds = unique(
        dto.items.flatMap((i) => (i.customerPackageId ? [i.customerPackageId] : [])),
      );
      const [serviceSnaps, productSnaps, packageSnaps, rulesSnap] = await Promise.all([
        Promise.all(serviceIds.map((id) => tx.get(ref(TENANT_COLLECTION.spaServices, id)))),
        Promise.all(productIds.map((id) => tx.get(ref(TENANT_COLLECTION.spaProducts, id)))),
        Promise.all(packageIds.map((id) => tx.get(ref(TENANT_COLLECTION.spaCustomerPackages, id)))),
        tx.get(
          this.store.collection(TENANT_COLLECTION.spaCommissionRules).where('active', '==', true),
        ),
      ]);
      if (dto.appointmentId) {
        const appointment = live(
          await tx.get(ref(TENANT_COLLECTION.spaAppointments, dto.appointmentId)),
        );
        if (!appointment) throw spaNotFound('Randevu bulunamadı.');
        if (!OPEN_APPOINTMENT_STATUSES.includes(appointment['status'] as AppointmentStatus)) {
          throw spaPrecondition('Bu randevu zaten kapatılmış (tamamlandı, iptal veya gelmedi).');
        }
      }
      const counterRef = ref(TENANT_COLLECTION.spaCounters, 'sessions');
      const counterSnap = await tx.get(counterRef);

      const products = toMap<ProductRecord>(productSnaps);
      const packages = toMap<CustomerPackageRecord>(packageSnaps);
      const priced = priceCheckout({
        customerId: dto.customerId,
        staffId: dto.staffId,
        staffDefaultPercent: Number(staff['primOraniVarsayilan'] ?? 0),
        items: dto.items,
        payments,
        globalDiscount,
        services: toMap<ServiceRecord>(serviceSnaps),
        products,
        packages,
        rules: rulesSnap.docs
          .map((doc) => doc.data() as SpaDoc)
          .filter((rule) => !isDeleted(rule)) as unknown as CommissionRuleRecord[],
        now: Date.now(),
      });

      // ---- Writes ----
      const nextSeq = Number(counterSnap.data()?.['value'] ?? 0) + 1;
      const receiptNo = `S-${dateStampInTz(timeZone)}-${String(nextSeq).padStart(4, '0')}`;
      const now = new Date().toISOString();
      const sessionRef = this.store.collection(TENANT_COLLECTION.spaSessions).doc();
      const accrualRefs = priced.commissionLines.map(() =>
        this.store.collection(TENANT_COLLECTION.spaCommissionAccruals).doc(),
      );

      tx.set(counterRef, { value: nextSeq }, { merge: true });
      accrualRefs.forEach((accrualRef, index) => {
        tx.set(accrualRef, {
          ...createBaseFields(accrualRef.id, userId, now),
          staffId: priced.commissionLines[index].staffId,
          sessionId: sessionRef.id,
          amount: priced.commissionLines[index].amount,
          status: 'pending',
          date: now,
        });
      });
      tx.set(sessionRef, {
        ...createBaseFields(sessionRef.id, userId, now),
        appointmentId: dto.appointmentId ?? null,
        customerId: dto.customerId,
        staffId: dto.staffId,
        roomId: dto.roomId,
        items: priced.resolvedItems,
        totalAmount: priced.totalAmount,
        discountAmount: globalDiscount,
        payments,
        commissionAccrualIds: accrualRefs.map((r) => r.id),
        receiptNo,
      });
      for (const [productId, qty] of priced.productDecrements) {
        const current = Number(products.get(productId)?.mevcutStok ?? 0);
        tx.update(ref(TENANT_COLLECTION.spaProducts, productId), {
          mevcutStok: current - qty,
          updatedAt: now,
        });
      }
      for (const [packageId, qty] of priced.packageDecrements) {
        const current = Number(packages.get(packageId)?.kalanSeans ?? 0);
        tx.update(ref(TENANT_COLLECTION.spaCustomerPackages, packageId), {
          kalanSeans: current - qty,
          updatedAt: now,
        });
      }
      if (dto.appointmentId) {
        tx.update(ref(TENANT_COLLECTION.spaAppointments, dto.appointmentId), {
          status: 'Tamamlandı',
          sessionId: sessionRef.id,
          updatedAt: now,
          updatedBy: userId,
        });
      }
      return { sessionId: sessionRef.id, receiptNo, totalAmount: priced.totalAmount };
    });

    await this.store.audit('sessions', 'callable', result.sessionId, null, {
      receiptNo: result.receiptNo,
      totalAmount: result.totalAmount,
    });
    return result;
  }
}

function live(snapshot: DocumentSnapshot): SpaDoc | null {
  const data = snapshot.exists ? (snapshot.data() as SpaDoc) : null;
  return data && !isDeleted(data) ? data : null;
}

function toMap<T>(snapshots: DocumentSnapshot[]): Map<string, T> {
  return new Map(
    snapshots.flatMap((snapshot) => {
      const data = live(snapshot);
      return data ? [[snapshot.id, data as unknown as T] as const] : [];
    }),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

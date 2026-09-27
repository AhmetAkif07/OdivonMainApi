import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields, isDeleted } from '../../../shared/firestore/base-document';
import { assertCashDayOpen } from '../shared/cash-day';
import { spaNotFound, spaPrecondition } from '../shared/spa-errors';
import { assertPayments, round2 } from '../shared/spa-money';
import { SpaDoc, SpaStore } from '../shared/spa-store';
import { SellSpaPackageDto } from './package.dto';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SpaPackagesService {
  constructor(private readonly store: SpaStore) {}

  /**
   * Customer packages, newest first. Packages past `bitisTarihi` are flipped to `expired` here
   * (replacing the old daily sweep); checkout re-checks the date anyway.
   */
  async listCustomerPackages(query: {
    from?: string;
    to?: string;
    customerId?: string;
    status?: string;
    limit?: number;
  }) {
    const items = await this.store.list(TENANT_COLLECTION.spaCustomerPackages, {
      dateField: 'satisTarihi',
      from: query.from,
      to: query.to,
      equals: { customerId: query.customerId },
      orderBy: { field: 'satisTarihi', dir: 'desc' },
      limit: query.limit,
    });
    const now = Date.now();
    const expired = items.filter(
      (item) =>
        item['status'] === 'active' &&
        item['bitisTarihi'] &&
        Date.parse(String(item['bitisTarihi'])) < now,
    );
    if (expired.length > 0) {
      const batch = this.store.db.batch();
      for (const item of expired) {
        batch.update(this.store.doc(TENANT_COLLECTION.spaCustomerPackages, item.id), {
          status: 'expired',
        });
        item['status'] = 'expired';
      }
      await batch.commit();
    }
    return query.status ? items.filter((item) => item['status'] === query.status) : items;
  }

  /** Sells a package and records the money in payments so the cash register and reports include it. */
  async sell(dto: SellSpaPackageDto) {
    const payments = assertPayments(dto.payments);
    const timeZone = await this.store.timeZone();
    const userId = this.store.userId();

    const result = await this.store.runTransaction(async (tx) => {
      await assertCashDayOpen(tx, this.store, timeZone);
      const [planSnap, customerSnap] = await Promise.all([
        tx.get(this.store.doc(TENANT_COLLECTION.spaPackagePlans, dto.packagePlanId)),
        tx.get(this.store.doc(TENANT_COLLECTION.spaCustomers, dto.customerId)),
      ]);
      const plan = planSnap.exists ? (planSnap.data() as SpaDoc) : null;
      if (!plan || isDeleted(plan)) throw spaNotFound('Paket planı bulunamadı.');
      if (!customerSnap.exists) throw spaNotFound('Müşteri bulunamadı.');
      if (plan['active'] === false) throw spaPrecondition('Paket planı aktif değil.');

      const price = Number(plan['fiyat']);
      const paid = round2(payments.reduce((sum, p) => sum + p.amount, 0));
      if (Math.abs(paid - price) > 0.01) {
        throw spaPrecondition('Ödeme tutarı paket fiyatına eşit olmalı.');
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const packageRef = this.store.collection(TENANT_COLLECTION.spaCustomerPackages).doc();
      tx.set(packageRef, {
        ...createBaseFields(packageRef.id, userId, nowIso),
        customerId: dto.customerId,
        packagePlanId: dto.packagePlanId,
        toplamSeans: plan['seansAdedi'],
        kalanSeans: plan['seansAdedi'],
        satisTarihi: nowIso,
        bitisTarihi: new Date(
          now.getTime() + Number(plan['gecerlilikGunu']) * DAY_MS,
        ).toISOString(),
        status: 'active',
      });

      for (const payment of payments) {
        const paymentRef = this.store.collection(TENANT_COLLECTION.spaPayments).doc();
        tx.set(paymentRef, {
          ...createBaseFields(paymentRef.id, userId, nowIso),
          customerId: dto.customerId,
          method: payment.method,
          amount: payment.amount,
          note: `Paket satışı: ${String(plan['ad'])}`,
          isRefund: false,
          customerPackageId: packageRef.id,
        });
      }
      return { customerPackageId: packageRef.id };
    });

    await this.store.audit('customerPackages', 'callable', result.customerPackageId, null, {
      customerId: dto.customerId,
      packagePlanId: dto.packagePlanId,
    });
    return result;
  }
}

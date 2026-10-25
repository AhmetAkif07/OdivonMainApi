import { randomUUID } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { gymToday } from '../gym/ops/receivables.math';
import { daysUntil, effectiveSubscription, nextPeriod, receiptNo, SAAS_GRACE_DAYS, SAAS_REMINDER_DAYS, SaasCycle, TenantBillingState } from './saas-billing';
import { SaasPricingService, STATIC_SAAS_PRICING } from '../saas-pricing/saas-pricing.service';

export interface SaasPaymentRecord {
  id: string;
  receiptNo: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  amountKurus: number;
  currency: 'TRY';
  mode: 'sandbox' | 'live';
  periodStartsAt: string;
  periodEndsAt: string;
  paidAt: string;
}

export interface SaasNotice {
  id: string;
  type: 'saas_expiring' | 'saas_grace';
  daysLeft: number;
  endsAt: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

/** Payment history, owner notices and the daily "subscription ends soon" reminders of a gym. */
@Injectable()
export class SaasBillingService {
  private readonly logger = new Logger(SaasBillingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
    @Optional() private readonly pricing: SaasPricingService = STATIC_SAAS_PRICING,
  ) {}

  private col(name: string, tenantId = this.tenant.getTenantId()) {
    return this.firebase.db.collection(`tenants/${tenantId}/${name}`);
  }

  async history(): Promise<SaasPaymentRecord[]> {
    const snapshot = await this.col('saasPayments').get();
    return snapshot.docs.map((doc) => doc.data() as SaasPaymentRecord).sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  }

  /** Billing state for the subscription screen: end date, grace and days left. */
  async status() {
    const tenant = (await this.firebase.db.doc(`tenants/${this.tenant.getTenantId()}`).get()).data() as TenantBillingState | undefined;
    const state = effectiveSubscription(tenant ?? {});
    return {
      ...state,
      graceDays: SAAS_GRACE_DAYS,
      daysLeft: state.subscriptionEndsAt ? daysUntil(state.subscriptionEndsAt, gymToday()) : null,
    };
  }

  async notices(): Promise<SaasNotice[]> {
    const snapshot = await this.col('saasNotices').get();
    return snapshot.docs
      .map((doc) => doc.data() as SaasNotice)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 20);
  }

  async markNoticesRead(): Promise<{ updated: number }> {
    const unread = (await this.col('saasNotices').get()).docs.filter((doc) => !doc.data()['readAt']);
    const at = new Date().toISOString();
    await Promise.all(unread.map((doc) => doc.ref.update({ readAt: at })));
    return { updated: unread.length };
  }

  /**
   * Daily (cron, per gym): an in-app notice to the owner 7, 3 and 1 days before the paid period
   * ends and once when the grace period starts. The notice id is the reminder key, written with
   * `create()`, so repeated runs cannot duplicate it.
   */
  async runReminders(day = gymToday()): Promise<number> {
    const tenantId = this.tenant.getTenantId();
    const tenant = (await this.firebase.db.doc(`tenants/${tenantId}`).get()).data() as TenantBillingState | undefined;
    if (tenant?.membershipStatus !== 'active' || !tenant.subscriptionEndsAt) return 0;
    const endsAt = tenant.subscriptionEndsAt;
    const left = daysUntil(endsAt, day);
    const endLabel = new Date(Date.parse(endsAt) + 3 * 3_600_000).toISOString().slice(0, 10).split('-').reverse().join('.');
    let notice: Omit<SaasNotice, 'id' | 'createdAt' | 'readAt'> | null = null;
    if ((SAAS_REMINDER_DAYS as readonly number[]).includes(left)) {
      notice = {
        type: 'saas_expiring',
        daysLeft: left,
        endsAt,
        title: `Odivon aboneliğiniz ${left} gün sonra bitiyor`,
        body: `Aboneliğiniz ${endLabel} tarihinde sona eriyor. Kesintisiz kullanım için Abonelik ekranından yenileyebilirsiniz.`,
      };
    } else if (left === -1) {
      notice = {
        type: 'saas_grace',
        daysLeft: left,
        endsAt,
        title: 'Odivon aboneliğinizin süresi doldu',
        body: `${SAAS_GRACE_DAYS} günlük ek süre içindesiniz. Ek süre bitince panel erişimi kapanır; Abonelik ekranından yenileyebilirsiniz.`,
      };
    }
    if (!notice) return 0;
    const id = `${notice.type}_${endsAt.slice(0, 10)}_${left}`;
    try {
      await this.col('saasNotices', tenantId).doc(id).create({ ...notice, id, createdAt: new Date().toISOString(), readAt: null });
      return 1;
    } catch {
      return 0; // already sent for this period and milestone
    }
  }

  logRun(created: number, gyms: number) {
    this.logger.log(`SaaS reminders: ${created} notices in ${gyms} gyms`);
  }
  async subscribe(planId: string, billingCycle: 'monthly' | 'yearly', _cardHolderName?: string) {
    const tenantId = this.tenant.getTenantId();
    const tenantRef = this.firebase.db.doc(`tenants/${tenantId}`);
    const tenantData = (await tenantRef.get()).data() as TenantBillingState | undefined;
    const currentEnd = tenantData?.membershipStatus === 'active' ? tenantData.subscriptionEndsAt : null;
    const paidAt = new Date().toISOString();
    const period = nextPeriod(currentEnd, billingCycle as SaasCycle, new Date(paidAt));
    const sessionId = randomUUID();
    const recNo = receiptNo(sessionId, paidAt);

    await tenantRef.update({
      membershipStatus: 'active',
      planId,
      billingCycle,
      subscriptionEndsAt: period.endsAt,
      updatedAt: paidAt,
    });

    const amount = (await this.pricing.price(planId, billingCycle)) ?? 1490;
    const paymentRecord: SaasPaymentRecord = {
      id: sessionId,
      receiptNo: recNo,
      planId,
      billingCycle,
      amountKurus: Math.round(amount * 100),
      currency: 'TRY',
      mode: 'sandbox',
      periodStartsAt: period.startsAt,
      periodEndsAt: period.endsAt,
      paidAt,
    };

    await this.col('saasPayments').doc(sessionId).set(paymentRecord);

    return {
      success: true,
      membershipStatus: 'active',
      planId,
      billingCycle,
      subscriptionEndsAt: period.endsAt,
      receiptNo: recNo,
      paidAt,
    };
  }

  async expireDemoTrial() {
    const tenantId = this.tenant.getTenantId();
    const expiredAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await this.firebase.db.doc(`tenants/${tenantId}`).update({
      membershipStatus: 'expired',
      trialEndsAt: expiredAt,
      updatedAt: new Date().toISOString(),
    });
    return { membershipStatus: 'expired', trialEndsAt: expiredAt };
  }

  async resetDemoTrial() {
    const tenantId = this.tenant.getTenantId();
    const freshTrial = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await this.firebase.db.doc(`tenants/${tenantId}`).update({
      membershipStatus: 'trial',
      trialEndsAt: freshTrial,
      updatedAt: new Date().toISOString(),
    });
    return { membershipStatus: 'trial', trialEndsAt: freshTrial };
  }
}

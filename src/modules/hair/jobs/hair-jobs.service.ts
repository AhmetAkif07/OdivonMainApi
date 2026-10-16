import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { HairAppointmentSmsService } from '../notifications/sms/hair-appointment-sms.service';
import { HairStore } from '../shared/hair-store';
import { dateIdInTz } from '../shared/hair-time';
import { live, str } from '../shared/hair-tx';

const SYSTEM_USER = 'system:hair-jobs';
const REMINDABLE = ['pending', 'confirmed'];

export interface HairJobResult {
  tenants: number;
  remindersSent: number;
  remindersFailed: number;
  packagesExpired: number;
}

/**
 * Scheduled hair jobs (cron / POST /hair/jobs/run): appointment reminders `reminderHoursBefore`
 * ahead and marking customer packages past their end date as expired. Both are idempotent: an
 * appointment is claimed (`reminderSent`) in a transaction before its SMS goes out.
 */
@Injectable()
export class HairJobsService {
  private readonly logger = new Logger(HairJobsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly store: HairStore,
    private readonly appointmentSms: HairAppointmentSmsService,
  ) {}

  async runAll(now = new Date()): Promise<HairJobResult> {
    const results = await this.forEachHairTenant(async () => ({
      reminders: await this.sendReminders(now),
      expired: await this.expirePackages(now),
    }));
    const total = {
      tenants: results.length,
      remindersSent: results.reduce((sum, r) => sum + r.reminders.sent, 0),
      remindersFailed: results.reduce((sum, r) => sum + r.reminders.failed, 0),
      packagesExpired: results.reduce((sum, r) => sum + r.expired, 0),
    };
    this.logger.log(`Hair jobs: ${JSON.stringify(total)}`);
    return total;
  }

  async runReminders(now = new Date()) {
    const results = await this.forEachHairTenant(() => this.sendReminders(now));
    return {
      tenants: results.length,
      remindersSent: results.reduce((sum, r) => sum + r.sent, 0),
      remindersFailed: results.reduce((sum, r) => sum + r.failed, 0),
    };
  }

  async runPackageExpiry(now = new Date()) {
    const results = await this.forEachHairTenant(() => this.expirePackages(now));
    return { tenants: results.length, packagesExpired: results.reduce((sum, n) => sum + n, 0) };
  }

  /** Current tenant: SMS reminders for open appointments starting within `reminderHoursBefore`. */
  async sendReminders(now = new Date()): Promise<{ sent: number; failed: number }> {
    const settings = await this.store.settings();
    const hours = settings.reminderHoursBefore;
    if (!hours || !settings.smsTemplates.reminder.enabled || !this.appointmentSms.isConfigured()) {
      return { sent: 0, failed: 0 };
    }
    const until = new Date(now.getTime() + hours * 3_600_000);
    const due = await this.store.rows(TENANT_COLLECTION.hairAppointments, undefined, {
      field: 'startAt',
      from: now.toISOString(),
      to: until.toISOString(),
    });
    let sent = 0;
    let failed = 0;
    for (const candidate of due) {
      if (!REMINDABLE.includes(str(candidate['status'])) || candidate['reminderSent'] === true) continue;
      const ref = this.store.ref(TENANT_COLLECTION.hairAppointments, candidate.id);
      const claimed = await this.store.runTransaction(async (tx) => {
        const current = live(await tx.get(ref));
        if (!current || !REMINDABLE.includes(str(current['status'])) || current['reminderSent'] === true) return null;
        tx.update(ref, { reminderSent: true, reminderSentAt: new Date().toISOString() });
        return current;
      });
      if (!claimed) continue;
      if (await this.appointmentSms.notify(claimed, 'reminder')) {
        sent++;
      } else {
        failed++;
        // Release the claim so the next run retries while the appointment is still ahead.
        await ref.update({ reminderSent: false, reminderSentAt: null, reminderError: new Date().toISOString() });
      }
    }
    return { sent, failed };
  }

  /** Current tenant: active packages whose end date has passed become `expired`. */
  async expirePackages(now = new Date()): Promise<number> {
    const today = dateIdInTz(await this.store.timeZone(), now);
    const active = await this.store.rows(TENANT_COLLECTION.hairCustomerPackages, { field: 'status', op: '==', value: 'active' });
    const stale = active.filter((pkg) => str(pkg['endDate']) && str(pkg['endDate']) < today);
    const stamp = new Date().toISOString();
    for (let i = 0; i < stale.length; i += 400) {
      const batch = this.store.db.batch();
      for (const pkg of stale.slice(i, i + 400)) {
        batch.update(this.store.ref(TENANT_COLLECTION.hairCustomerPackages, pkg.id), {
          status: 'expired',
          expiredAt: stamp,
          updatedAt: stamp,
          updatedBy: SYSTEM_USER,
        });
      }
      await batch.commit();
    }
    return stale.length;
  }

  /** Runs `run` once per active tenant with the hair module, as a system user; one failure never stops the rest. */
  async forEachHairTenant<T>(run: () => Promise<T>): Promise<T[]> {
    const snapshot = await this.firebase.db.collection(ROOT_COLLECTION.tenants).where('modules', 'array-contains', 'hair').get();
    const results: T[] = [];
    for (const doc of snapshot.docs) {
      const tenant = doc.data() as { status?: string };
      if (tenant.status && tenant.status !== 'active') continue;
      try {
        results.push(
          await this.tenantContext.run({ tenantId: doc.id, userId: SYSTEM_USER, role: 'owner', modules: ['hair'], email: '' }, run),
        );
      } catch (error) {
        this.logger.error(`Hair job failed for tenant ${doc.id}`, error as Error);
      }
    }
    return results;
  }
}

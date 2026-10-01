import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { BaseDocument, createBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { MembersRepository } from '../members/members.repository';
import { GymOpsService } from '../ops/ops.service';
import { gymToday } from '../ops/receivables.math';
import { GymStore } from '../shared/gym-store';
import { ReminderSettingsDto } from './reminders.dto';
import {
  expiringReminders,
  inactiveReminders,
  mergeSettings,
  overdueReminders,
  ReminderCandidate,
  ReminderMember,
  ReminderPlan,
  ReminderSettings,
  ReminderType,
  render,
} from './reminders.rules';

export interface GymReminder extends BaseDocument {
  tenantId: string;
  type: ReminderType;
  userId: string;
  memberName: string;
  phone: string | null;
  milestone: number;
  /** Gym-local calendar day of the run that created it. */
  day: string;
  title: string;
  body: string;
  inApp: boolean;
  sms: 'disabled' | 'no_phone' | 'sent' | 'failed';
  smsBatchId: string | null;
}

export interface ReminderRunResult {
  tenantId: string;
  day: string;
  dryRun: boolean;
  enabled: boolean;
  candidates: number;
  created: number;
  skippedExisting: number;
  byType: Record<ReminderType, number>;
  preview?: Pick<GymReminder, 'type' | 'userId' | 'memberName' | 'title' | 'body'>[];
}

const SYSTEM_USER = 'system:reminders';
const DAY_MS = 86_400_000;

@Injectable()
export class GymRemindersService {
  private readonly logger = new Logger(GymRemindersService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
    private readonly store: GymStore,
    private readonly members: MembersRepository,
    private readonly ops: GymOpsService,
  ) {}

  async getSettings(): Promise<ReminderSettings> {
    const stored = await this.store.getSingleton<BaseDocument & Partial<ReminderSettings>>(TENANT_COLLECTION.gymReminderSettings);
    return mergeSettings(stored);
  }

  async saveSettings(dto: ReminderSettingsDto): Promise<ReminderSettings> {
    const current = await this.getSettings();
    const next = mergeSettings({
      ...current,
      ...dto,
      templates: {
        membership_expiring: { ...current.templates.membership_expiring, ...dto.templates?.membership_expiring },
        installment_overdue: { ...current.templates.installment_overdue, ...dto.templates?.installment_overdue },
        inactive_member: { ...current.templates.inactive_member, ...dto.templates?.inactive_member },
      },
    });
    await this.store.upsertSingleton(TENANT_COLLECTION.gymReminderSettings, next);
    return next;
  }

  /** Reminders of one gym-local day, for the staff "today's reminders" list. */
  async list(day = gymToday(), type?: ReminderType) {
    const snapshot = await this.store.collection(TENANT_COLLECTION.gymReminders).where('day', '==', day).get();
    return snapshot.docs
      .map((doc) => doc.data() as GymReminder)
      .filter((item) => !type || item.type === type)
      .sort((a, b) => a.type.localeCompare(b.type) || a.memberName.localeCompare(b.memberName, 'tr'));
  }

  /**
   * Finds today's due reminders for the current tenant and records each exactly once: the
   * document id is the reminder key and is written with `create()`, so a second run (or a second
   * isolate running the same cron) cannot send it again.
   */
  async runForTenant(options: { day?: string; dryRun?: boolean } = {}): Promise<ReminderRunResult> {
    const day = options.day ?? gymToday();
    const dryRun = options.dryRun ?? false;
    const tenantId = this.tenantContext.getTenantId();
    const settings = await this.getSettings();
    const byType: Record<ReminderType, number> = { membership_expiring: 0, installment_overdue: 0, inactive_member: 0 };
    const result: ReminderRunResult = { tenantId, day, dryRun, enabled: settings.enabled, candidates: 0, created: 0, skippedExisting: 0, byType };
    if (!settings.enabled && !dryRun) return result;

    const candidates = await this.collect(day, settings);
    result.candidates = candidates.length;
    const reminders = this.store.collection(TENANT_COLLECTION.gymReminders);
    const existing = new Set(
      candidates.length
        ? (await this.firebase.db.getAll(...candidates.map((c) => reminders.doc(c.key)))).filter((s) => s.exists).map((s) => s.id)
        : [],
    );
    const fresh = candidates.filter((c) => !existing.has(c.key));
    result.skippedExisting = candidates.length - fresh.length;

    if (dryRun) {
      result.preview = fresh.map((c) => ({ type: c.type, userId: c.userId, memberName: c.memberName, ...this.message(c, settings) }));
      fresh.forEach((c) => (byType[c.type] += 1));
      return result;
    }

    for (const candidate of fresh) {
      const { title, body } = this.message(candidate, settings);
      const ref = reminders.doc(candidate.key);
      const doc: GymReminder = {
        ...createBaseFields(candidate.key, SYSTEM_USER),
        tenantId,
        type: candidate.type,
        userId: candidate.userId,
        memberName: candidate.memberName,
        phone: candidate.phone,
        milestone: candidate.milestone,
        day,
        title,
        body,
        inApp: true,
        sms: settings.smsEnabled ? (candidate.phone ? 'sent' : 'no_phone') : 'disabled',
        smsBatchId: null,
      };
      try {
        await ref.create(doc);
      } catch {
        result.skippedExisting += 1; // created concurrently by another run
        continue;
      }
      await this.store.create(TENANT_COLLECTION.gymMemberNotifications, {
        userId: candidate.userId,
        // Same type as the member app's lazy expiry notice, so it is not shown twice.
        type: candidate.type === 'membership_expiring' ? `membership_expiry_${candidate.milestone}` : candidate.type,
        title,
        body,
        readAt: null,
        reminderKey: candidate.key,
      });
      if (doc.sms === 'sent') {
        try {
          const sms = await this.ops.sendSms({ recipients: [candidate.phone as string], message: body });
          await ref.update({ smsBatchId: sms.batchId, sms: sms.sentCount > 0 ? 'sent' : 'failed' });
        } catch (error) {
          this.logger.warn(`SMS for reminder ${candidate.key} failed: ${(error as Error).message}`);
          await ref.update({ sms: 'failed' });
        }
      }
      result.created += 1;
      byType[candidate.type] += 1;
    }
    return result;
  }

  /** Daily cron entry: every active tenant with the gym module, each in its own tenant context. */
  async runAllTenants(day = gymToday()): Promise<ReminderRunResult[]> {
    const snapshot = await this.firebase.db.collection(ROOT_COLLECTION.tenants).where('modules', 'array-contains', 'gym').get();
    const results: ReminderRunResult[] = [];
    for (const doc of snapshot.docs) {
      const tenant = doc.data() as { status?: string; modules?: string[] };
      if (tenant.status && tenant.status !== 'active') continue;
      try {
        const run = await this.tenantContext.run(
          { tenantId: doc.id, userId: SYSTEM_USER, role: 'owner', modules: ['gym'], email: '' },
          () => this.runForTenant({ day }),
        );
        results.push(run);
      } catch (error) {
        this.logger.error(`Reminder run failed for tenant ${doc.id}`, error as Error);
      }
    }
    this.logger.log(`Reminder run ${day}: ${results.reduce((sum, r) => sum + r.created, 0)} created in ${results.length} gyms`);
    return results;
  }

  private message(candidate: ReminderCandidate, settings: ReminderSettings) {
    const template = settings.templates[candidate.type];
    return { title: render(template.title, candidate.vars), body: render(template.body, candidate.vars) };
  }

  private async collect(day: string, settings: ReminderSettings): Promise<ReminderCandidate[]> {
    const members = (await this.members.list({ archived: false })) as unknown as ReminderMember[];
    const plans = (await this.store.list<BaseDocument & ReminderPlan>(TENANT_COLLECTION.gymReceivables)).filter(
      (plan) => plan.status === 'open',
    );
    const inactive = await this.inactiveInputs(day, settings, members);
    return [
      ...expiringReminders(members, day, settings),
      ...overdueReminders(plans, day, settings),
      ...inactiveReminders(members, day, settings, inactive.recentVisitors, inactive.lastReminderAt, inactive.visitedSince),
    ];
  }

  /** Reads only the check-ins it needs: the last `inactiveDays` plus those after earlier reminders. */
  private async inactiveInputs(day: string, settings: ReminderSettings, members: ReminderMember[]) {
    const windowStart = new Date(Date.parse(`${day}T00:00:00+03:00`) - settings.inactiveDays * DAY_MS).toISOString();
    const previous = await this.store
      .collection(TENANT_COLLECTION.gymReminders)
      .where('type', '==', 'inactive_member')
      .get();
    const lastReminderAt = new Map<string, string>();
    for (const doc of previous.docs) {
      const item = doc.data() as GymReminder;
      if ((lastReminderAt.get(item.userId) ?? '') < item.createdAt) lastReminderAt.set(item.userId, item.createdAt);
    }
    const earliest = [...lastReminderAt.values(), windowStart].sort()[0];
    const logs = await this.store.collection(TENANT_COLLECTION.gymAccessLogs).where('createdAt', '>=', earliest).get();
    const recentVisitors = new Set<string>();
    const visitedSince = new Set<string>();
    const memberIds = new Set(members.map((m) => m.uid));
    for (const doc of logs.docs) {
      const log = doc.data() as { userId?: string; status?: string; direction?: string; createdAt?: string; timestamp?: string };
      if (!log.userId || !memberIds.has(log.userId) || log.status !== 'granted' || log.direction === 'out') continue;
      const at = String(log.timestamp ?? log.createdAt ?? '');
      if (at >= windowStart) recentVisitors.add(log.userId);
      const reminded = lastReminderAt.get(log.userId);
      if (reminded && at > reminded) visitedSince.add(log.userId);
    }
    return { recentVisitors, lastReminderAt, visitedSince };
  }
}

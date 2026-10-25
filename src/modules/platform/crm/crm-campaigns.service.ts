import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { CampaignAudience, CrmDirectoryService } from './crm-directory.service';
import { CrmNotificationsService } from './crm-notifications.service';
import { renderPlaceholders, textToHtml, wrapEmailLayout } from './crm-templates';
import { HostingerMailClient } from './hostinger-mail.client';
import { CampaignChannel, CreateCampaignDto, NotificationLevel, UpdateCampaignDto } from './dto';

export const CAMPAIGNS_COLLECTION = 'platformCampaigns';

/**
 * Every mail is one Hostinger API call and Workers cap subrequests per invocation, so a campaign
 * goes out in steps: the panel calls send-step until done, and the hourly job continues any
 * campaign left in "sending" (for example when the panel was closed).
 */
const STEP_SIZE = 20;
const CRON_STEPS_PER_CAMPAIGN = 3;
const MAX_FAILURES_KEPT = 100;

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';

export interface CampaignRecipient {
  email: string;
  name: string | null;
  tenantId: string | null;
  tenantName: string | null;
}

export interface CampaignDoc {
  id: string;
  name: string;
  subject: string;
  body: string;
  bodyFormat: 'text' | 'html';
  channels: CampaignChannel[];
  audience: CampaignAudience;
  ctaUrl: string | null;
  ctaLabel: string | null;
  notificationLevel: NotificationLevel;
  scheduledAt: string | null;
  mailbox: string | null;
  status: CampaignStatus;
  recipients: CampaignRecipient[];
  cursor: number;
  stats: { tenants: number; recipients: number; sent: number; failed: number; notified: number };
  failures: { email: string; error: string }[];
  notificationBroadcastId: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUid: string;
  createdByEmail: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface CampaignStepResult {
  id: string;
  status: CampaignStatus;
  done: boolean;
  sent: number;
  failed: number;
  total: number;
}

@Injectable()
export class CrmCampaignsService {
  private readonly logger = new Logger(CrmCampaignsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly directory: CrmDirectoryService,
    private readonly notifications: CrmNotificationsService,
    private readonly mail: HostingerMailClient,
    private readonly audit: PlatformAuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(CAMPAIGNS_COLLECTION);
  }

  async list() {
    const snap = await this.collection().orderBy('createdAt', 'desc').limit(200).get();
    return { items: snap.docs.map((d) => summarize(d.data() as CampaignDoc)) };
  }

  async get(id: string) {
    const doc = await this.load(id);
    const { recipients, ...rest } = doc;
    return { ...rest, recipientsPreview: recipients.slice(0, 50) };
  }

  async previewAudience(audience: CampaignAudience) {
    const tenants = await this.directory.resolveAudience(audience);
    const recipients = this.recipientsFor(tenants, audience);
    return {
      tenantCount: tenants.length,
      recipientCount: recipients.length,
      tenantsWithoutEmail: tenants.filter((t) => !t.emails.length).length,
      sample: tenants.slice(0, 20).map((t) => ({ id: t.id, name: t.name, modules: t.modules, emails: t.emails.map((e) => e.email) })),
    };
  }

  async create(dto: CreateCampaignDto, admin: PlatformAdminUser) {
    const ref = this.collection().doc();
    const now = new Date().toISOString();
    const doc: CampaignDoc = {
      id: ref.id,
      name: dto.name.trim(),
      subject: dto.subject.trim(),
      body: dto.body,
      bodyFormat: dto.bodyFormat ?? 'text',
      channels: unique(dto.channels),
      audience: clean(dto.audience),
      ctaUrl: dto.ctaUrl || null,
      ctaLabel: dto.ctaLabel || null,
      notificationLevel: dto.notificationLevel ?? 'info',
      scheduledAt: dto.scheduledAt || null,
      mailbox: dto.mailbox || null,
      status: dto.scheduledAt ? 'scheduled' : 'draft',
      recipients: [],
      cursor: 0,
      stats: { tenants: 0, recipients: 0, sent: 0, failed: 0, notified: 0 },
      failures: [],
      notificationBroadcastId: null,
      createdAt: now,
      updatedAt: now,
      createdByUid: admin.uid,
      createdByEmail: admin.email,
      startedAt: null,
      completedAt: null,
    };
    await ref.set(doc);
    await this.record(admin, 'crm.campaign.create', doc.id, { name: doc.name, channels: doc.channels });
    return summarize(doc);
  }

  async update(id: string, dto: UpdateCampaignDto, admin: PlatformAdminUser) {
    const doc = await this.load(id);
    if (doc.status !== 'draft' && doc.status !== 'scheduled') {
      throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Gönderimi başlamış bir kampanya düzenlenemez');
    }
    const patch: Partial<CampaignDoc> = { updatedAt: new Date().toISOString() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.subject !== undefined) patch.subject = dto.subject.trim();
    if (dto.body !== undefined) patch.body = dto.body;
    if (dto.bodyFormat !== undefined) patch.bodyFormat = dto.bodyFormat;
    if (dto.channels !== undefined) patch.channels = unique(dto.channels);
    if (dto.audience !== undefined) patch.audience = clean(dto.audience);
    if (dto.ctaUrl !== undefined) patch.ctaUrl = dto.ctaUrl || null;
    if (dto.ctaLabel !== undefined) patch.ctaLabel = dto.ctaLabel || null;
    if (dto.notificationLevel !== undefined) patch.notificationLevel = dto.notificationLevel;
    if (dto.mailbox !== undefined) patch.mailbox = dto.mailbox || null;
    if (dto.scheduledAt !== undefined) {
      if (dto.scheduledAt && Number.isNaN(Date.parse(dto.scheduledAt))) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Geçersiz planlama tarihi');
      }
      patch.scheduledAt = dto.scheduledAt || null;
      patch.status = dto.scheduledAt ? 'scheduled' : 'draft';
    }
    await this.collection().doc(id).update(patch);
    await this.record(admin, 'crm.campaign.update', id, { fields: Object.keys(dto) });
    return summarize({ ...doc, ...patch });
  }

  async duplicate(id: string, admin: PlatformAdminUser) {
    const doc = await this.load(id);
    return this.create(
      {
        name: `${doc.name} (kopya)`,
        subject: doc.subject,
        body: doc.body,
        bodyFormat: doc.bodyFormat,
        channels: doc.channels,
        audience: doc.audience,
        ctaUrl: doc.ctaUrl ?? undefined,
        ctaLabel: doc.ctaLabel ?? undefined,
        notificationLevel: doc.notificationLevel,
        mailbox: doc.mailbox ?? undefined,
      },
      admin,
    );
  }

  async remove(id: string, admin: PlatformAdminUser) {
    const doc = await this.load(id);
    if (doc.status === 'sending') {
      throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Gönderilmekte olan kampanya silinemez, önce durdurun');
    }
    await this.collection().doc(id).delete();
    await this.record(admin, 'crm.campaign.delete', id, { name: doc.name, status: doc.status });
    return { ok: true };
  }

  async cancel(id: string, admin: PlatformAdminUser) {
    const doc = await this.load(id);
    if (doc.status !== 'sending' && doc.status !== 'scheduled') {
      throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Yalnızca planlanmış veya gönderilen kampanya durdurulabilir');
    }
    const now = new Date().toISOString();
    await this.collection().doc(id).update({ status: 'cancelled', updatedAt: now, completedAt: now });
    await this.record(admin, 'crm.campaign.cancel', id, { sent: doc.stats.sent, total: doc.stats.recipients });
    return { ok: true };
  }

  /** Sends one rendered copy to an address so the admin can check it before the real send. */
  async sendTest(id: string, to: string, admin: PlatformAdminUser) {
    const doc = await this.load(id);
    const box = await this.mail.resolveMailbox(doc.mailbox);
    const sample: CampaignRecipient = { email: to, name: 'Örnek Kişi', tenantId: null, tenantName: 'Örnek İşletme' };
    const rendered = render(doc, sample);
    await this.mail.send(box.resourceId, {
      to: [to],
      subject: `[TEST] ${rendered.subject}`,
      html: rendered.html,
      text: rendered.text,
      displayName: 'Odivon',
    });
    await this.record(admin, 'crm.campaign.test', id, { to });
    return { ok: true };
  }

  /** Resolves the audience, posts the in-app notification and queues the mails. */
  async start(id: string, admin: Pick<PlatformAdminUser, 'uid' | 'email'>): Promise<CampaignStepResult> {
    const doc = await this.load(id);
    if (doc.status !== 'draft' && doc.status !== 'scheduled') {
      throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Bu kampanya zaten gönderildi veya durduruldu');
    }
    const tenants = await this.directory.resolveAudience(doc.audience);
    const now = new Date().toISOString();
    const patch: Partial<CampaignDoc> = { startedAt: now, updatedAt: now };

    if (doc.channels.includes('notification') && tenants.length) {
      const res = await this.notifications.deliver(
        tenants,
        doc.audience,
        {
          title: doc.subject,
          body: plainText(doc),
          level: doc.notificationLevel,
          link: doc.ctaUrl,
          linkLabel: doc.ctaLabel,
          campaignId: doc.id,
        },
        admin,
      );
      patch.notificationBroadcastId = res.id;
    }

    const recipients = doc.channels.includes('email') ? this.recipientsFor(tenants, doc.audience) : [];
    patch.recipients = recipients;
    patch.cursor = 0;
    patch.stats = {
      tenants: tenants.length,
      recipients: recipients.length,
      sent: 0,
      failed: 0,
      notified: doc.channels.includes('notification') ? tenants.length : 0,
    };
    patch.status = recipients.length ? 'sending' : 'sent';
    if (!recipients.length) patch.completedAt = now;
    await this.collection().doc(id).update(patch);
    await this.record(admin, 'crm.campaign.start', id, { tenants: tenants.length, recipients: recipients.length });
    return { id, status: patch.status, done: !recipients.length, sent: 0, failed: 0, total: recipients.length };
  }

  /** Sends the next batch of mails. Call again until done=true. */
  async step(id: string): Promise<CampaignStepResult> {
    const doc = await this.load(id);
    const total = doc.recipients.length;
    if (doc.status !== 'sending') {
      return { id, status: doc.status, done: true, sent: doc.stats.sent, failed: doc.stats.failed, total };
    }
    const box = await this.mail.resolveMailbox(doc.mailbox);
    const batch = doc.recipients.slice(doc.cursor, doc.cursor + STEP_SIZE);
    let sent = doc.stats.sent;
    let failed = doc.stats.failed;
    const failures = [...doc.failures];

    for (const r of batch) {
      const rendered = render(doc, r);
      try {
        await this.mail.send(box.resourceId, {
          to: [r.email],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          displayName: 'Odivon',
        });
        sent++;
      } catch (err) {
        failed++;
        if (failures.length < MAX_FAILURES_KEPT) failures.push({ email: r.email, error: (err as Error).message.slice(0, 200) });
      }
    }

    const cursor = doc.cursor + batch.length;
    const done = cursor >= total;
    // Re-read the status: the admin may have cancelled while this batch was going out.
    const latest = await this.load(id);
    const status: CampaignStatus = latest.status === 'cancelled' ? 'cancelled' : done ? 'sent' : 'sending';
    const now = new Date().toISOString();
    await this.collection().doc(id).update({
      cursor,
      stats: { ...doc.stats, sent, failed },
      failures,
      status,
      updatedAt: now,
      ...(status !== 'sending' ? { completedAt: now } : {}),
    });
    return { id, status, done: status !== 'sending', sent, failed, total };
  }

  /** Hourly job: starts due scheduled campaigns and continues unfinished ones. */
  async runJobs(): Promise<{ started: number; stepped: number }> {
    const now = new Date().toISOString();
    const [scheduled, sending] = await Promise.all([
      this.collection().where('status', '==', 'scheduled').get(),
      this.collection().where('status', '==', 'sending').get(),
    ]);
    let started = 0;
    let stepped = 0;
    const system = { uid: 'system', email: 'cron@odivon' };
    const ids = sending.docs.map((d) => d.id);
    for (const d of scheduled.docs) {
      const c = d.data() as CampaignDoc;
      if (c.scheduledAt && c.scheduledAt <= now) {
        try {
          const res = await this.start(c.id, system);
          started++;
          if (!res.done) ids.push(c.id);
        } catch (err) {
          this.logger.error(`Planlı kampanya başlatılamadı (${c.id}): ${(err as Error).message}`);
        }
      }
    }
    for (const id of ids) {
      for (let i = 0; i < CRON_STEPS_PER_CAMPAIGN; i++) {
        try {
          const res = await this.step(id);
          stepped++;
          if (res.done) break;
        } catch (err) {
          this.logger.error(`Kampanya gönderimi sürdürülemedi (${id}): ${(err as Error).message}`);
          break;
        }
      }
    }
    return { started, stepped };
  }

  private recipientsFor(
    tenants: { id: string; name: string; emails: { email: string; name: string | null }[] }[],
    audience: CampaignAudience,
  ): CampaignRecipient[] {
    const seen = new Set<string>();
    const out: CampaignRecipient[] = [];
    for (const t of tenants) {
      for (const e of t.emails) {
        if (seen.has(e.email)) continue;
        seen.add(e.email);
        out.push({ email: e.email, name: e.name, tenantId: t.id, tenantName: t.name });
      }
    }
    for (const raw of audience.extraEmails ?? []) {
      const email = raw.trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push({ email, name: null, tenantId: null, tenantName: null });
    }
    return out;
  }

  private async load(id: string): Promise<CampaignDoc> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Kampanya bulunamadı');
    return snap.data() as CampaignDoc;
  }

  private record(admin: Pick<PlatformAdminUser, 'uid' | 'email'>, action: string, id: string, after: Record<string, unknown>) {
    return this.audit.record({ adminUid: admin.uid, adminEmail: admin.email, action, targetType: 'crm', targetId: id, after });
  }
}

export function render(doc: Pick<CampaignDoc, 'subject' | 'body' | 'bodyFormat' | 'ctaUrl' | 'ctaLabel'>, r: CampaignRecipient) {
  const vars = { tenantName: r.tenantName, name: r.name, email: r.email };
  const subject = renderPlaceholders(doc.subject, vars, false);
  const isHtml = doc.bodyFormat === 'html';
  const bodyHtml = isHtml ? renderPlaceholders(doc.body, vars, true) : textToHtml(renderPlaceholders(doc.body, vars, false));
  const text = isHtml ? undefined : renderPlaceholders(doc.body, vars, false);
  return {
    subject,
    text,
    html: wrapEmailLayout({ bodyHtml, preheader: subject, ctaUrl: doc.ctaUrl, ctaLabel: doc.ctaLabel }),
  };
}

function plainText(doc: Pick<CampaignDoc, 'body' | 'bodyFormat'>): string {
  const raw = doc.bodyFormat === 'html' ? doc.body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '') : doc.body;
  // Placeholders make no sense in a tenant-wide notification; drop them.
  return raw.replace(/\{\{[^}]+\}\}/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

function summarize(doc: CampaignDoc) {
  const { recipients: _r, failures, body: _b, ...rest } = doc;
  return { ...rest, failureCount: failures?.length ?? 0 };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clean<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

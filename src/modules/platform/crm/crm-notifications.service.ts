import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { AudienceTenant, CampaignAudience, CrmDirectoryService } from './crm-directory.service';
import { escapeHtml, textToHtml, wrapEmailLayout } from './crm-templates';
import { HostingerMailClient } from './hostinger-mail.client';
import { NotificationLevel, SendNotificationDto } from './dto';

/** Per-tenant copy the tenant apps read: tenants/{tenantId}/platformNotifications/{id}. */
export const TENANT_NOTIFICATIONS = 'platformNotifications';
/** Admin-side record of each send: platformNotificationBroadcasts/{id}. */
export const NOTIFICATION_BROADCASTS = 'platformNotificationBroadcasts';

const BATCH_SIZE = 400;
/** Mails sent inside one request; the rest are skipped and reported (use a campaign for big lists). */
const MAX_DIRECT_EMAILS = 40;

export interface TenantNotificationDoc {
  id: string;
  broadcastId: string;
  campaignId: string | null;
  title: string;
  body: string;
  level: NotificationLevel;
  link: string | null;
  linkLabel: string | null;
  createdAt: string;
  expiresAt: string | null;
  /** Uids of tenant users who have read it. */
  readBy: string[];
  deletedAt: string | null;
}

export interface NotificationBroadcastDoc {
  id: string;
  title: string;
  body: string;
  level: NotificationLevel;
  link: string | null;
  linkLabel: string | null;
  audience: CampaignAudience;
  tenantIds: string[];
  tenantCount: number;
  emailed: number;
  emailFailed: number;
  campaignId: string | null;
  createdAt: string;
  createdByUid: string;
  createdByEmail: string;
  expiresAt: string | null;
  deletedAt: string | null;
}

export interface NotificationInput {
  title: string;
  body: string;
  level?: NotificationLevel;
  link?: string | null;
  linkLabel?: string | null;
  expiresAt?: string | null;
  campaignId?: string | null;
}

@Injectable()
export class CrmNotificationsService {
  private readonly logger = new Logger(CrmNotificationsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly directory: CrmDirectoryService,
    private readonly mail: HostingerMailClient,
    private readonly audit: PlatformAuditService,
  ) {}

  private broadcasts() {
    return this.firebase.db.collection(NOTIFICATION_BROADCASTS);
  }

  private tenantCollection(tenantId: string) {
    return this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_NOTIFICATIONS));
  }

  async listBroadcasts(limit = 100) {
    const snap = await this.broadcasts().orderBy('createdAt', 'desc').limit(limit).get();
    const items = snap.docs
      .map((d) => d.data() as NotificationBroadcastDoc)
      .filter((b) => !b.deletedAt)
      .map(({ tenantIds: _ids, ...rest }) => rest);
    return { items };
  }

  async getBroadcast(id: string) {
    const snap = await this.broadcasts().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Bildirim bulunamadı');
    const broadcast = snap.data() as NotificationBroadcastDoc;
    // Read counts come from the per-tenant copies.
    const reads = await Promise.all(
      broadcast.tenantIds.slice(0, 200).map(async (tenantId) => {
        const doc = await this.tenantCollection(tenantId).doc(id).get();
        const data = doc.exists ? (doc.data() as TenantNotificationDoc) : null;
        return { tenantId, read: Boolean(data?.readBy?.length) };
      }),
    );
    return { ...broadcast, readTenantCount: reads.filter((r) => r.read).length, reads };
  }

  /** Admin action from the Notifications page. */
  async send(dto: SendNotificationDto, admin: PlatformAdminUser) {
    const tenants = await this.directory.resolveAudience(dto.audience);
    if (!tenants.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Seçilen filtrelere uyan işletme yok');
    }
    const result = await this.deliver(
      tenants,
      dto.audience,
      { ...dto, campaignId: null },
      admin,
    );

    let emailed = 0;
    let emailFailed = 0;
    let emailSkipped = 0;
    if (dto.alsoEmail) {
      const recipients = tenants.flatMap((t) => t.emails.map((e) => ({ ...e, tenantName: t.name })));
      const box = await this.mail.resolveMailbox(null);
      for (const [index, r] of recipients.entries()) {
        if (index >= MAX_DIRECT_EMAILS) {
          emailSkipped = recipients.length - MAX_DIRECT_EMAILS;
          break;
        }
        try {
          await this.mail.send(box.resourceId, {
            to: [r.email],
            subject: dto.title,
            displayName: 'Odivon',
            html: wrapEmailLayout({
              bodyHtml: `<h2 style="margin:0 0 12px;font-size:20px">${escapeHtml(dto.title)}</h2>${textToHtml(dto.body)}`,
              preheader: dto.body.slice(0, 120),
              ctaUrl: dto.link,
              ctaLabel: dto.linkLabel,
            }),
            text: dto.body,
          });
          emailed++;
        } catch (err) {
          emailFailed++;
          this.logger.warn(`Bildirim maili gönderilemedi (${r.email}): ${(err as Error).message}`);
        }
      }
      await this.broadcasts().doc(result.id).update({ emailed, emailFailed });
    }

    return { ...result, emailed, emailFailed, emailSkipped };
  }

  /** Writes one notification into every tenant and records the broadcast. Used by campaigns too. */
  async deliver(
    tenants: AudienceTenant[],
    audience: CampaignAudience,
    input: NotificationInput,
    admin: Pick<PlatformAdminUser, 'uid' | 'email'>,
  ): Promise<{ id: string; tenantCount: number }> {
    const ref = this.broadcasts().doc();
    const now = new Date().toISOString();
    const base: Omit<TenantNotificationDoc, 'id'> = {
      broadcastId: ref.id,
      campaignId: input.campaignId ?? null,
      title: input.title.trim(),
      body: input.body.trim(),
      level: input.level ?? 'info',
      link: input.link || null,
      linkLabel: input.linkLabel || null,
      createdAt: now,
      expiresAt: input.expiresAt || null,
      readBy: [],
      deletedAt: null,
    };

    for (let i = 0; i < tenants.length; i += BATCH_SIZE) {
      const batch = this.firebase.db.batch();
      for (const tenant of tenants.slice(i, i + BATCH_SIZE)) {
        batch.set(this.tenantCollection(tenant.id).doc(ref.id), { ...base, id: ref.id });
      }
      await batch.commit();
    }

    const broadcast: NotificationBroadcastDoc = {
      id: ref.id,
      title: base.title,
      body: base.body,
      level: base.level,
      link: base.link,
      linkLabel: base.linkLabel,
      audience: stripUndefined(audience),
      tenantIds: tenants.map((t) => t.id),
      tenantCount: tenants.length,
      emailed: 0,
      emailFailed: 0,
      campaignId: base.campaignId,
      createdAt: now,
      createdByUid: admin.uid,
      createdByEmail: admin.email,
      expiresAt: base.expiresAt,
      deletedAt: null,
    };
    await ref.set(broadcast);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'crm.notification.send',
      targetType: 'crm',
      targetId: ref.id,
      after: { title: base.title, level: base.level, tenantCount: tenants.length },
    });
    return { id: ref.id, tenantCount: tenants.length };
  }

  /** Withdraws a notification from every tenant it was sent to. */
  async withdraw(id: string, admin: PlatformAdminUser) {
    const ref = this.broadcasts().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Bildirim bulunamadı');
    const broadcast = snap.data() as NotificationBroadcastDoc;
    const now = new Date().toISOString();
    for (let i = 0; i < broadcast.tenantIds.length; i += BATCH_SIZE) {
      const batch = this.firebase.db.batch();
      for (const tenantId of broadcast.tenantIds.slice(i, i + BATCH_SIZE)) {
        batch.set(this.tenantCollection(tenantId).doc(id), { deletedAt: now }, { merge: true });
      }
      await batch.commit();
    }
    await ref.update({ deletedAt: now });
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'crm.notification.withdraw',
      targetType: 'crm',
      targetId: id,
      before: { title: broadcast.title, tenantCount: broadcast.tenantCount },
    });
    return { ok: true };
  }

  // ---------- Tenant side ----------

  async listForTenant(tenantId: string, uid: string, opts: { unreadOnly?: boolean; limit?: number }) {
    const limit = Math.min(100, Math.max(1, opts.limit ?? 30));
    const snap = await this.tenantCollection(tenantId).orderBy('createdAt', 'desc').limit(limit).get();
    const now = new Date().toISOString();
    const items = snap.docs
      .map((d) => d.data() as TenantNotificationDoc)
      .filter((n) => !n.deletedAt && (!n.expiresAt || n.expiresAt > now))
      .map(({ readBy, ...n }) => ({ ...n, read: (readBy ?? []).includes(uid) }))
      .filter((n) => !opts.unreadOnly || !n.read);
    return { items, unreadCount: items.filter((n) => !n.read).length };
  }

  async markRead(tenantId: string, uid: string, id: string) {
    const ref = this.tenantCollection(tenantId).doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Bildirim bulunamadı');
    const doc = snap.data() as TenantNotificationDoc;
    if (!(doc.readBy ?? []).includes(uid)) {
      await ref.update({ readBy: [...(doc.readBy ?? []), uid] });
    }
    return { ok: true };
  }

  async markAllRead(tenantId: string, uid: string) {
    const { items } = await this.listForTenant(tenantId, uid, { unreadOnly: true, limit: 100 });
    for (const n of items) await this.markRead(tenantId, uid, n.id);
    return { ok: true, count: items.length };
  }
}

function stripUndefined<T extends object>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

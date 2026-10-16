import { Injectable, Logger } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { hairInvalid, hairNotFound } from '../shared/hair-errors';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairActor, HairDoc, HairStore } from '../shared/hair-store';
import { str } from '../shared/hair-tx';
import { SendHairNotificationDto } from './notification.dto';
import { SMS_LOG_KIND } from './sms/hair-sms.service';

const NOT_FOUND = 'Bildirim bulunamadı.';

/**
 * In-app notification centre (plan §4.11). Rows with `recipientId: null` are broadcasts to the
 * staff of their branch. External channels (SMS / e-mail / WhatsApp) are only queued here as
 * `pending`; delivery belongs to the scheduled sender (N-007), which is not part of this module yet.
 */
@Injectable()
export class HairNotificationsService {
  private readonly logger = new Logger(HairNotificationsService.name);

  constructor(private readonly store: HairStore) {}

  async list(query: HairListQueryDto) {
    const actor = await this.store.actorOrThrow();
    return this.store.list(TENANT_COLLECTION.hairNotifications, {
      equals: { type: query.type },
      match: (item) =>
        item['kind'] !== SMS_LOG_KIND &&
        this.visibleTo(actor, item) &&
        (query.status !== 'unread' || !item['readAt']) &&
        (query.status !== 'read' || !!item['readAt']),
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  /** SMS attempts recorded by HairSmsService (`kind: smsLog`). */
  smsLog(query: HairListQueryDto) {
    return this.store.list(TENANT_COLLECTION.hairNotifications, {
      dateField: 'createdAt',
      from: query.from,
      to: query.to,
      equals: { kind: SMS_LOG_KIND, type: query.type, status: query.status, customerId: query.customerId },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  async markRead(id: string) {
    const actor = await this.store.actorOrThrow();
    const item = await this.store.getOrThrow(TENANT_COLLECTION.hairNotifications, id, NOT_FOUND);
    if (!this.visibleTo(actor, item)) throw hairNotFound(NOT_FOUND);
    if (item['readAt']) return item;
    const readAt = new Date().toISOString();
    await this.store.doc(TENANT_COLLECTION.hairNotifications, id).update({ readAt, readBy: actor.userId });
    return { ...item, readAt, readBy: actor.userId };
  }

  async send(dto: SendHairNotificationDto) {
    const external = dto.channel === 'sms' || dto.channel === 'email' || dto.channel === 'whatsapp';
    if (external && !dto.customerId) throw hairInvalid('SMS / e-posta / WhatsApp için müşteri seçilmelidir.');
    if (dto.customerId) {
      await this.store.getOrThrow(TENANT_COLLECTION.hairCustomers, dto.customerId, 'Müşteri bulunamadı.');
    }
    return this.store.create(TENANT_COLLECTION.hairNotifications, 'hairNotifications', {
      recipientId: dto.recipientId ?? null,
      customerId: dto.customerId,
      branchId: dto.branchId,
      type: dto.type ?? 'manual',
      title: dto.title,
      body: dto.body,
      channel: dto.channel,
      status: external ? 'pending' : 'sent',
      sentAt: external ? null : new Date().toISOString(),
      readAt: null,
    });
  }

  /** Best-effort in-app broadcast to a branch's staff (low stock, online booking …); never throws. */
  async notifyStaff(input: { branchId?: string | null; type: string; title: string; body: string; link?: string }) {
    try {
      await this.store.create(TENANT_COLLECTION.hairNotifications, 'hairNotifications', {
        recipientId: null,
        branchId: input.branchId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        channel: 'in-app',
        status: 'sent',
        sentAt: new Date().toISOString(),
        readAt: null,
      });
    } catch (error) {
      this.logger.error(`Failed to write hair notification ${input.type}`, error as Error);
    }
  }

  private visibleTo(actor: HairActor, item: HairDoc): boolean {
    const recipient = item['recipientId'];
    if (recipient) return recipient === actor.userId || recipient === actor.staffId;
    const branchId = str(item['branchId']);
    return !branchId || actor.branchIds === null || actor.branchIds.includes(branchId);
  }
}

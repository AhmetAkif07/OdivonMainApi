import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { CrmContact, CrmDirectoryService } from './crm-directory.service';
import { textToHtml, wrapEmailLayout } from './crm-templates';
import { HostingerFolder, HostingerMailClient, HostingerMessage } from './hostinger-mail.client';
import { MailFlagsDto, MailListQueryDto, SendMailDto } from './dto';

export type CrmMailListItem = HostingerMessage & { contact: CrmContact | null };

const DEFAULT_FOLDER = 'INBOX';
const SENDER_NAME = 'Odivon';

@Injectable()
export class CrmMailService {
  private readonly logger = new Logger(CrmMailService.name);

  constructor(
    private readonly client: HostingerMailClient,
    private readonly directory: CrmDirectoryService,
    private readonly audit: PlatformAuditService,
  ) {}

  async status() {
    if (!this.client.configured()) {
      return { configured: false, mailboxes: [], defaultMailbox: null, error: null as string | null };
    }
    try {
      const mailboxes = await this.client.listMailboxes();
      const def = await this.client.resolveMailbox(null).catch(() => null);
      return { configured: true, mailboxes, defaultMailbox: def?.resourceId ?? null, error: null as string | null };
    } catch (err) {
      return { configured: true, mailboxes: [], defaultMailbox: null, error: (err as Error).message };
    }
  }

  async folders(mailbox?: string): Promise<{ mailbox: string; address: string; folders: HostingerFolder[] }> {
    const box = await this.client.resolveMailbox(mailbox);
    const res = await this.client.listFolders(box.resourceId);
    return { mailbox: box.resourceId, address: box.address, folders: sortFolders(res.data ?? []) };
  }

  async list(query: MailListQueryDto) {
    const box = await this.client.resolveMailbox(query.mailbox);
    const folder = query.folder || DEFAULT_FOLDER;
    const page = Math.max(1, Number(query.page) || 1);
    const perPage = Math.min(100, Math.max(1, Number(query.perPage) || 30));
    const q = query.q?.trim();
    const unseenOnly = query.unseen === 'true';

    const res = q
      ? await this.client.searchMessages(box.resourceId, folder, { text: q }, page, perPage)
      : await this.client.listMessages(box.resourceId, folder, page, perPage);

    // The API has no "unseen" search; the filter applies to the current page.
    let messages = res.data ?? [];
    if (unseenOnly) messages = messages.filter((m) => m.unseen);
    const items = await this.withContacts(messages, folder);
    return { mailbox: box.resourceId, folder, items, pagination: res.pagination };
  }

  async get(uid: number, folder = DEFAULT_FOLDER, mailbox?: string) {
    const box = await this.client.resolveMailbox(mailbox);
    const [msg, body] = await Promise.all([
      this.client.getMessage(box.resourceId, folder, uid),
      this.client.getMessageText(box.resourceId, folder, uid),
    ]);
    const message = msg.data;
    if (message.unseen) {
      // Opening a mail marks it read, like any mail client.
      await this.client.updateFlags(box.resourceId, folder, uid, ['\\Seen'], []).catch((err) =>
        this.logger.warn(`Okundu işareti konamadı (${uid}): ${(err as Error).message}`),
      );
      message.unseen = false;
    }
    const [withContact] = await this.withContacts([message], folder);
    return {
      mailbox: box.resourceId,
      folder,
      message: withContact,
      text: body.data?.text ?? null,
      html: body.data?.html ?? null,
    };
  }

  async setFlags(uid: number, folder: string, dto: MailFlagsDto, mailbox?: string) {
    const box = await this.client.resolveMailbox(mailbox);
    const add: string[] = [];
    const remove: string[] = [];
    if (dto.seen !== undefined) (dto.seen ? add : remove).push('\\Seen');
    if (dto.flagged !== undefined) (dto.flagged ? add : remove).push('\\Flagged');
    if (!add.length && !remove.length) return { ok: true };
    await this.client.updateFlags(box.resourceId, folder, uid, add, remove);
    return { ok: true };
  }

  async move(uid: number, folder: string, targetFolder: string, mailbox?: string) {
    const box = await this.client.resolveMailbox(mailbox);
    await this.client.moveMessage(box.resourceId, folder, uid, targetFolder);
    return { ok: true };
  }

  /** Moves to Trash; a message already in Trash is deleted for good. */
  async remove(uid: number, folder: string, mailbox?: string) {
    const box = await this.client.resolveMailbox(mailbox);
    const folders = (await this.client.listFolders(box.resourceId)).data ?? [];
    const trash = folders.find((f) => f.specialUse === '\\Trash');
    if (trash && trash.path !== folder) {
      await this.client.moveMessage(box.resourceId, folder, uid, trash.path);
      return { ok: true, movedTo: trash.path };
    }
    await this.client.deleteMessage(box.resourceId, folder, uid);
    return { ok: true, movedTo: null };
  }

  attachment(uid: number, folder: string, attachmentId: string, mailbox?: string) {
    return this.client
      .resolveMailbox(mailbox)
      .then((box) => this.client.downloadAttachment(box.resourceId, folder, uid, attachmentId));
  }

  async send(dto: SendMailDto, admin: PlatformAdminUser) {
    if (dto.inReplyTo && dto.forwardOf) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bir mail aynı anda hem cevap hem iletme olamaz');
    }
    const box = await this.client.resolveMailbox(dto.mailbox);
    const format = dto.bodyFormat ?? 'text';
    const bodyHtml = format === 'html' ? dto.body : textToHtml(dto.body);
    const useLayout = dto.useLayout ?? !(dto.inReplyTo || dto.forwardOf);
    const html = useLayout ? wrapEmailLayout({ bodyHtml }) : bodyHtml;

    await this.client.send(box.resourceId, {
      to: dto.to,
      cc: dto.cc?.length ? dto.cc : undefined,
      bcc: dto.bcc?.length ? dto.bcc : undefined,
      subject: dto.subject,
      html,
      text: format === 'text' ? dto.body : undefined,
      displayName: SENDER_NAME,
      inReplyTo: dto.inReplyTo,
      forwardOf: dto.forwardOf,
    });

    const contacts = await this.directory.lookup(dto.to);
    const tenantId = [...contacts.values()][0]?.tenantId;
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: dto.inReplyTo ? 'crm.mail.reply' : 'crm.mail.send',
      targetType: 'crm',
      tenantId,
      targetId: dto.to.join(','),
      after: { subject: dto.subject, to: dto.to, cc: dto.cc ?? [], mailbox: box.address },
    });
    return { ok: true };
  }

  /**
   * Mail history with one address: received (INBOX, from) and sent (Sent folder, to), newest first.
   * Used by the tenant detail page and the contact panel of the inbox.
   */
  async conversation(email: string, mailbox?: string) {
    const address = email.trim().toLowerCase();
    if (!address) throw new AppException(ErrorCode.VALIDATION_ERROR, 'E-posta adresi gerekli');
    const box = await this.client.resolveMailbox(mailbox);
    const folders = (await this.client.listFolders(box.resourceId)).data ?? [];
    const sent = folders.find((f) => f.specialUse === '\\Sent');

    const [inbox, outbox] = await Promise.all([
      this.client.searchMessages(box.resourceId, DEFAULT_FOLDER, { from: address }, 1, 50),
      sent
        ? this.client.searchMessages(box.resourceId, sent.path, { text: address }, 1, 50)
        : Promise.resolve({ data: [] as HostingerMessage[] }),
    ]);
    const items = [
      ...(inbox.data ?? []).map((m) => ({ ...m, folder: DEFAULT_FOLDER, direction: 'in' as const })),
      ...(outbox.data ?? [])
        .filter((m) => [...(m.to ?? []), ...(m.cc ?? [])].some((a) => a.address?.toLowerCase() === address))
        .map((m) => ({ ...m, folder: sent!.path, direction: 'out' as const })),
    ].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const contact = (await this.directory.lookup([address])).get(address) ?? null;
    return { mailbox: box.resourceId, email: address, contact, items };
  }

  private async withContacts(messages: HostingerMessage[], folder: string): Promise<CrmMailListItem[]> {
    const outgoing = /sent|gönder/i.test(folder);
    const addressOf = (m: HostingerMessage) =>
      (outgoing ? m.to?.[0]?.address : m.from?.address)?.toLowerCase() ?? '';
    const contacts = await this.directory.lookup(messages.map(addressOf));
    return messages.map((m) => ({ ...m, contact: contacts.get(addressOf(m)) ?? null }));
  }
}

const FOLDER_ORDER: Record<string, number> = {
  '\\Inbox': 0,
  '\\Flagged': 1,
  '\\Sent': 2,
  '\\Drafts': 3,
  '\\Archive': 4,
  '\\Junk': 5,
  '\\Trash': 6,
};

function sortFolders(folders: HostingerFolder[]): HostingerFolder[] {
  const rank = (f: HostingerFolder) =>
    f.path.toUpperCase() === 'INBOX' ? 0 : (FOLDER_ORDER[f.specialUse ?? ''] ?? 10);
  return [...folders].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'tr'));
}

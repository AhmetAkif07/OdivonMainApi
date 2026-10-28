import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

/**
 * Hostinger Mail API (https://api.mail.hostinger.com) over plain HTTPS, so it runs on Cloudflare
 * Workers without IMAP sockets. The token is created in hPanel > Emails > Agentic Mail > API access
 * and stored as the HOSTINGER_MAIL_API_TOKEN secret; it is never written to code or Firestore.
 */
const BASE_URL = 'https://api.mail.hostinger.com/api/v1';
const TIMEOUT_MS = 15_000;

export interface HostingerAddress {
  name?: string | null;
  address: string;
}

export interface HostingerAttachment {
  id: string;
  contentType: string;
  sizeBytes: number;
  inline: boolean;
  filename: string | null;
  contentId?: string | null;
}

export interface HostingerMessage {
  uid: number;
  path: string;
  date: string;
  flags: string[];
  unseen: boolean;
  size: number;
  subject: string;
  from: HostingerAddress | null;
  to: HostingerAddress[];
  cc: HostingerAddress[];
  bcc: HostingerAddress[];
  messageId: string | null;
  inReplyTo: string | null;
  attachments: HostingerAttachment[];
}

export interface HostingerFolder {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null;
  messageCount: number;
  unreadCount: number;
}

export interface HostingerPagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface HostingerMailbox {
  resourceId: string;
  address: string;
}

export interface HostingerSearch {
  text?: string;
  from?: string;
  subject?: string;
  since?: string;
  before?: string;
  flags?: string[];
}

export interface HostingerSendRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string;
  text?: string;
  displayName?: string;
  inReplyTo?: { uid: number; folder: string };
  forwardOf?: { uid: number; folder: string };
}

@Injectable()
export class HostingerMailClient {
  private mailboxesCache: { at: number; items: HostingerMailbox[] } | null = null;

  configured(): boolean {
    return Boolean(process.env.HOSTINGER_MAIL_API_TOKEN);
  }

  /** Mailboxes the token may manage (cached 10 minutes). */
  async listMailboxes(): Promise<HostingerMailbox[]> {
    if (this.mailboxesCache && Date.now() - this.mailboxesCache.at < 10 * 60_000) {
      return this.mailboxesCache.items;
    }
    const res = await this.request<{ data: { mailboxes?: HostingerMailbox[] } }>('GET', '/me');
    const items = res.data?.mailboxes ?? [];
    this.mailboxesCache = { at: Date.now(), items };
    return items;
  }

  /** Requested mailbox, else HOSTINGER_MAILBOX_RESOURCE_ID, else the first mailbox of the token. */
  async resolveMailbox(requested?: string | null): Promise<HostingerMailbox> {
    const mailboxes = await this.listMailboxes();
    const wanted = requested?.trim() || process.env.HOSTINGER_MAILBOX_RESOURCE_ID?.trim() || '';
    const found = wanted
      ? mailboxes.find((m) => m.resourceId === wanted || m.address.toLowerCase() === wanted.toLowerCase())
      : mailboxes[0];
    if (found) return found;
    if (wanted && !mailboxes.length) return { resourceId: wanted, address: process.env.SMTP_USER || '' };
    throw new AppException(
      ErrorCode.CRM_MAIL_NOT_CONFIGURED,
      wanted ? `Mail kutusu bulunamadı: ${wanted}` : 'Hostinger API anahtarı hiçbir mail kutusuna yetkili değil',
    );
  }

  listFolders(mailboxId: string) {
    return this.request<{ data: HostingerFolder[] }>('GET', `/mailboxes/${enc(mailboxId)}/folders`);
  }

  listMessages(mailboxId: string, folder: string, page: number, perPage: number) {
    return this.request<{ data: HostingerMessage[]; pagination: HostingerPagination }>(
      'GET',
      `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages`,
      { query: { page, perPage, sort: '-date' } },
    );
  }

  searchMessages(mailboxId: string, folder: string, search: HostingerSearch, page: number, perPage: number) {
    return this.request<{ data: HostingerMessage[]; pagination: HostingerPagination }>(
      'POST',
      `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/search`,
      { query: { page, perPage, sort: '-date' }, body: search },
    );
  }

  getMessage(mailboxId: string, folder: string, uid: number) {
    return this.request<{ data: HostingerMessage }>(
      'GET',
      `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/${uid}`,
    );
  }

  getMessageText(mailboxId: string, folder: string, uid: number) {
    return this.request<{ data: { text?: string | null; html?: string | null } }>(
      'GET',
      `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/${uid}/text`,
    );
  }

  updateFlags(mailboxId: string, folder: string, uid: number, addFlags: string[], removeFlags: string[]) {
    return this.request<unknown>('PATCH', `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/${uid}`, {
      body: { addFlags, removeFlags },
    });
  }

  moveMessage(mailboxId: string, folder: string, uid: number, targetFolder: string) {
    return this.request<unknown>('POST', `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/${uid}/move`, {
      body: { targetFolder },
    });
  }

  deleteMessage(mailboxId: string, folder: string, uid: number) {
    return this.request<unknown>('DELETE', `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/${uid}`);
  }

  /** Raw attachment download; the caller streams the body to the panel. */
  async downloadAttachment(mailboxId: string, folder: string, uid: number, attachmentId: string): Promise<Response> {
    const res = await this.fetch(
      'GET',
      `/mailboxes/${enc(mailboxId)}/folders/${enc(folder)}/messages/${uid}/attachments/${enc(attachmentId)}`,
    );
    if (!res.ok) throw upstreamError(res.status, await safeText(res));
    return res;
  }

  async send(mailboxId: string, message: HostingerSendRequest): Promise<void> {
    await this.request<unknown>('POST', `/mailboxes/${enc(mailboxId)}/send`, { body: message });
  }

  private async request<T>(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<T> {
    const res = await this.fetch(method, path, options);
    if (!res.ok) throw upstreamError(res.status, await safeText(res));
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  private async fetch(
    method: string,
    path: string,
    options: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
  ): Promise<Response> {
    const token = process.env.HOSTINGER_MAIL_API_TOKEN;
    if (!token) {
      throw new AppException(
        ErrorCode.CRM_MAIL_NOT_CONFIGURED,
        'Hostinger Mail API anahtarı tanımlı değil (HOSTINGER_MAIL_API_TOKEN secret)',
      );
    }
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    try {
      return await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new AppException(ErrorCode.CRM_MAIL_UPSTREAM_ERROR, `Hostinger Mail API'ye ulaşılamadı: ${(err as Error).message}`);
    }
  }
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function upstreamError(status: number, body: string): AppException {
  let detail = body;
  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string };
    detail = parsed.message || parsed.error || body;
  } catch {
    // body is not JSON
  }
  if (status === 401 || status === 403) {
    return new AppException(
      ErrorCode.CRM_MAIL_NOT_CONFIGURED,
      `Hostinger Mail API anahtarı geçersiz veya bu mail kutusuna yetkisiz (HTTP ${status})`,
    );
  }
  if (status === 404) {
    return new AppException(ErrorCode.CRM_NOT_FOUND, 'Mail veya klasör bulunamadı');
  }
  return new AppException(ErrorCode.CRM_MAIL_UPSTREAM_ERROR, `Hostinger Mail API hatası (HTTP ${status}) ${detail}`.trim());
}

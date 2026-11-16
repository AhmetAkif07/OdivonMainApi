import { Injectable } from '@nestjs/common';
import { HostingerMailClient } from '../crm/hostinger-mail.client';
import { SmsProvider, smsProviderFromEnv } from '../../hair/notifications/sms/sms-provider';

const GRAPH_URL = 'https://graph.facebook.com/v21.0';
const WHATSAPP_TIMEOUT_MS = 10_000;

export interface ChannelSendResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string;
}

export interface WhatsappTemplateRef {
  /** Meta'da onaylı şablon adı. */
  name: string;
  language: string;
  /** Gövdedeki {{1}}, {{2}}… değerleri (lead'e göre doldurulmuş). */
  params: string[];
}

/**
 * Satış mesajlarının çıktığı kanallar.
 * - E-posta: CRM'in Hostinger Mail API istemcisi (HOSTINGER_MAIL_API_TOKEN).
 * - SMS: kuaför modülündeki Netgsm sağlayıcısı (SMS_PROVIDER / NETGSM_*).
 * - WhatsApp: Meta Cloud API; WHATSAPP_ACCESS_TOKEN + satış numarası SALES_WHATSAPP_PHONE_NUMBER_ID.
 *   Meta, son 24 saatte size yazmamış kişilere sadece onaylı şablonla mesaj gönderilmesine izin verir.
 */
@Injectable()
export class SalesChannelsService {
  private sms: SmsProvider = smsProviderFromEnv();

  constructor(private readonly mail: HostingerMailClient) {}

  /** Testler ve başka SMS sağlayıcıları için. */
  useSmsProvider(provider: SmsProvider) {
    this.sms = provider;
  }

  status() {
    return {
      email: { configured: this.mail.configured(), provider: 'hostinger' },
      whatsapp: {
        configured: this.whatsappConfigured(),
        provider: 'meta-cloud',
        note: 'Size son 24 saatte yazmamış kişilere sadece Meta onaylı şablonla gönderilebilir.',
      },
      sms: { configured: this.sms.isConfigured(), provider: this.sms.name },
    };
  }

  emailConfigured() {
    return this.mail.configured();
  }

  smsConfigured() {
    return this.sms.isConfigured();
  }

  whatsappConfigured() {
    return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.SALES_WHATSAPP_PHONE_NUMBER_ID);
  }

  /** Adım başına bir kez çözülür (mailbox listesi önbellekli). */
  resolveMailbox(requested?: string | null) {
    return this.mail.resolveMailbox(requested);
  }

  async sendEmail(
    mailboxId: string,
    message: { to: string; subject: string; html: string; text: string },
  ): Promise<ChannelSendResult> {
    try {
      await this.mail.send(mailboxId, {
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        displayName: 'Odivon',
      });
      return { ok: true, providerMessageId: null };
    } catch (error) {
      return { ok: false, error: (error as Error).message || 'E-posta gönderilemedi' };
    }
  }

  async sendSms(to: string, text: string): Promise<ChannelSendResult> {
    const r = await this.sms.send(to, text);
    return { ok: r.ok, providerMessageId: r.providerMessageId ?? null, error: r.error };
  }

  async sendWhatsapp(to: string, text: string, template?: WhatsappTemplateRef | null): Promise<ChannelSendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.SALES_WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) return { ok: false, error: 'WhatsApp satış numarası yapılandırılmamış.' };
    const payload = template
      ? {
          messaging_product: 'whatsapp',
          to: to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language || 'tr' },
            ...(template.params.length
              ? { components: [{ type: 'body', parameters: template.params.map((t) => ({ type: 'text', text: t || '-' })) }] }
              : {}),
          },
        }
      : { messaging_product: 'whatsapp', to: to.replace(/^\+/, ''), type: 'text', text: { body: text.slice(0, 4000) } };
    try {
      const res = await fetch(`${GRAPH_URL}/${encodeURIComponent(phoneNumberId)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(WHATSAPP_TIMEOUT_MS),
      });
      const body = (await res.json().catch(() => ({}))) as {
        messages?: { id?: string }[];
        error?: { message?: string; code?: number };
      };
      if (res.ok) return { ok: true, providerMessageId: body.messages?.[0]?.id ?? null };
      return { ok: false, error: `WhatsApp ${body.error?.code ?? res.status}: ${body.error?.message ?? 'gönderilemedi'}` };
    } catch (error) {
      return { ok: false, error: `WhatsApp isteği başarısız: ${(error as Error).message}` };
    }
  }
}

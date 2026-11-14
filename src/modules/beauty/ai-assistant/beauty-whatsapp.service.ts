import { createHmac, timingSafeEqual } from 'crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { runInBackground } from '../../../shared/http/background';
import { BeautyAiAssistantService } from './beauty-ai-assistant.service';

/** phone_number_id -> salon eşlemesi (Meta webhook'u sadece numara id'si gönderir). */
export const WHATSAPP_NUMBERS_COLLECTION = 'beautyWhatsappNumbers';
/** Meta aynı mesajı tekrar gönderebilir; işlenen mesaj id'leri burada tutulur. */
const WHATSAPP_INBOX_COLLECTION = 'beautyWhatsappInbox';
const GRAPH_URL = 'https://graph.facebook.com/v21.0';

export interface WaWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: { metadata?: { phone_number_id?: string }; messages?: WaMessage[] };
    }>;
  }>;
}

interface WaMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
}

/**
 * WhatsApp Cloud API bağlantısı. Gerekli Worker secret'ları:
 *  - WHATSAPP_VERIFY_TOKEN: Meta webhook doğrulamasında girilen serbest metin
 *  - WHATSAPP_APP_SECRET: Meta uygulamasının App Secret'ı (imza doğrulaması)
 *  - WHATSAPP_ACCESS_TOKEN: Sistem kullanıcısının kalıcı erişim anahtarı (mesaj gönderme)
 * Bunlar yoksa webhook 503 döner; geri kalan asistan (web/panel) etkilenmez.
 */
@Injectable()
export class BeautyWhatsappService {
  private readonly logger = new Logger(BeautyWhatsappService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly assistant: BeautyAiAssistantService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.WHATSAPP_VERIFY_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.WHATSAPP_ACCESS_TOKEN,
    );
  }

  verifyWebhook(mode?: string, token?: string, challenge?: string): string {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected) throw new ServiceUnavailableException('WhatsApp bağlantısı yapılandırılmadı.');
    if (mode !== 'subscribe' || token !== expected || !challenge) {
      throw new ForbiddenException('Doğrulama başarısız.');
    }
    return challenge;
  }

  checkSignature(rawBody: Buffer | undefined, signature: string | undefined): void {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret || !process.env.WHATSAPP_ACCESS_TOKEN) {
      throw new ServiceUnavailableException('WhatsApp bağlantısı yapılandırılmadı.');
    }
    if (!rawBody || !signature?.startsWith('sha256=')) throw new ForbiddenException('İmza eksik.');
    const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
    const given = Buffer.from(signature.slice('sha256='.length));
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new ForbiddenException('İmza geçersiz.');
    }
  }

  /** Webhook gövdesini hemen kabul eder; yanıtlar arka planda üretilip gönderilir. */
  handleWebhook(body: WaWebhookBody): void {
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value ?? {};
        const phoneNumberId = String(value?.metadata?.phone_number_id ?? '');
        for (const msg of value?.messages ?? []) {
          if (!phoneNumberId || !msg?.id || !msg?.from) continue;
          void runInBackground(
            this.processMessage(phoneNumberId, msg).catch((e: Error) =>
              this.logger.error(`WhatsApp mesajı işlenemedi: ${e.message}`),
            ),
          );
        }
      }
    }
  }

  private async processMessage(phoneNumberId: string, msg: WaMessage) {
    try {
      await this.firebase.db
        .collection(WHATSAPP_INBOX_COLLECTION)
        .doc(msg.id)
        .create({ phoneNumberId, from: msg.from, receivedAt: new Date().toISOString() });
    } catch {
      return; // daha önce işlendi
    }
    const mapping = await this.firebase.db.collection(WHATSAPP_NUMBERS_COLLECTION).doc(phoneNumberId).get();
    const tenantId = String(mapping.data()?.['tenantId'] ?? '');
    const branchId = String(mapping.data()?.['branchId'] ?? '');
    if (!mapping.exists || !tenantId || !branchId) {
      this.logger.warn(`Eşlenmemiş WhatsApp numarası: ${phoneNumberId}`);
      return;
    }
    // Slug değişmiş olabilir; her mesajda şubenin güncel online randevu linkini kullan.
    const branch = await this.firebase.db.doc(`tenants/${tenantId}/beautyBranches/${branchId}`).get();
    const slug = String(branch.data()?.['slug'] ?? '');
    if (!slug) {
      this.logger.warn(`WhatsApp numarasının şubesinde online randevu linki yok: ${phoneNumberId}`);
      return;
    }
    if (msg.type !== 'text' || !msg.text?.body?.trim()) {
      await this.send(phoneNumberId, msg.from, 'Şu an sadece yazılı mesajları anlayabiliyorum. Size nasıl yardımcı olabilirim?');
      return;
    }
    const phone = msg.from.startsWith('90') ? `0${msg.from.slice(2)}` : `+${msg.from}`;
    let reply: string;
    try {
      const result = await this.assistant.chat({
        slug,
        channel: 'whatsapp',
        conversationId: `wa_${phoneNumberId}_${msg.from}`,
        customerPhone: phone,
        message: msg.text.body,
      });
      reply = result.reply;
    } catch (e) {
      this.logger.error(`WhatsApp AI yanıtı üretilemedi: ${(e as Error).message}`);
      return;
    }
    await this.send(phoneNumberId, msg.from, reply);
  }

  async send(phoneNumberId: string, to: string, body: string) {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) throw new ServiceUnavailableException('WhatsApp bağlantısı yapılandırılmadı.');
    const res = await fetch(`${GRAPH_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: body.slice(0, 4000) },
      }),
    });
    if (!res.ok) {
      this.logger.error(`WhatsApp gönderimi başarısız (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
  }

  async getNumber(tenantId: string, branchId: string) {
    const snap = await this.firebase.db
      .collection(WHATSAPP_NUMBERS_COLLECTION)
      .where('tenantId', '==', tenantId)
      .where('branchId', '==', branchId)
      .limit(1)
      .get();
    const d = snap.docs[0]?.data();
    return d ? { phoneNumberId: String(d['phoneNumberId']), displayPhone: String(d['displayPhone'] ?? '') } : null;
  }

  async linkNumber(input: {
    tenantId: string;
    branchId: string;
    phoneNumberId: string;
    displayPhone?: string;
  }) {
    const ref = this.firebase.db.collection(WHATSAPP_NUMBERS_COLLECTION).doc(input.phoneNumberId);
    const existing = await ref.get();
    if (existing.exists) {
      const d = existing.data() ?? {};
      if (d['tenantId'] !== input.tenantId || d['branchId'] !== input.branchId) {
        throw new ConflictException('Bu WhatsApp numarası başka bir salona bağlı.');
      }
    }
    const previous = await this.getNumber(input.tenantId, input.branchId);
    if (previous && previous.phoneNumberId !== input.phoneNumberId) {
      await this.firebase.db.collection(WHATSAPP_NUMBERS_COLLECTION).doc(previous.phoneNumberId).delete();
    }
    await ref.set({
      phoneNumberId: input.phoneNumberId,
      displayPhone: input.displayPhone ?? '',
      tenantId: input.tenantId,
      branchId: input.branchId,
      module: 'beauty',
      updatedAt: new Date().toISOString(),
    });
    return { phoneNumberId: input.phoneNumberId, displayPhone: input.displayPhone ?? '' };
  }

  async unlinkNumber(tenantId: string, branchId: string) {
    const current = await this.getNumber(tenantId, branchId);
    if (current) {
      await this.firebase.db.collection(WHATSAPP_NUMBERS_COLLECTION).doc(current.phoneNumberId).delete();
    }
    return { removed: Boolean(current) };
  }
}

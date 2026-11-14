import { randomBytes } from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { BeautyBookingService, PUBLIC_SLUGS_COLLECTION } from '../booking/beauty-booking.service';
import { AI_ASSISTANT_SYSTEM_PROMPT, AI_ASSISTANT_TOOLS } from './beauty-ai-assistant.tools';

export type AiChannel = 'web' | 'whatsapp' | 'panel_test';

export interface AiChatInput {
  slug: string;
  message: string;
  channel: AiChannel;
  conversationId?: string;
  /** WhatsApp'ta yazan numara; randevuda telefon olarak kullanılır. */
  customerPhone?: string;
  /** Panel testinde true ise randevu kaydedilmez, sadece uygunluk kontrol edilir. */
  dryRun?: boolean;
  /** Panel testinde asistan kapalı olsa da çalışsın. */
  ignoreDisabled?: boolean;
}

export interface AiBookingResult {
  id: string | null;
  serviceName: string;
  staffName: string | null;
  startAt: string;
  dryRun: boolean;
}

export interface AiChatResult {
  conversationId: string;
  reply: string;
  bookings: AiBookingResult[];
}

export interface AiAssistantSettings {
  enabled: boolean;
  instructions: string;
}

type Msg = Anthropic.Beta.BetaMessageParam;

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 8;
/** Bu kadar sessiz kalan konuşma yeniden başlar (eski bağlamla yanlış randevu önermesin). */
const CONVERSATION_IDLE_MS = 12 * 60 * 60 * 1000;
/** Geçmiş bu boyutu aşarsa yeni konuşma açılır; maliyeti ve Firestore belge sınırını korur. */
const MAX_HISTORY_CHARS = 300_000;
const CONVERSATION_ID = /^[A-Za-z0-9_-]{8,80}$/;
const FALLBACK_REPLY =
  'Şu an isteğinizi işleyemedim. Randevu için lütfen salonu telefonla arayın ya da biraz sonra tekrar yazın.';

const WEEKDAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** Europe/Istanbul tarih ve saati (Worker UTC çalışır). */
export function istanbulNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const weekday = WEEKDAYS_TR[new Date(`${date}T12:00:00Z`).getUTCDay()];
  return { date, time: `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`, weekday };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

@Injectable()
export class BeautyAiAssistantService {
  private readonly logger = new Logger(BeautyAiAssistantService.name);
  private anthropic: Anthropic | null = null;

  constructor(
    private readonly booking: BeautyBookingService,
    private readonly firebase: FirebaseService,
  ) {}

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  model(): string {
    return process.env.BEAUTY_AI_MODEL || DEFAULT_MODEL;
  }

  private client(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException('AI asistan henüz yapılandırılmadı (ANTHROPIC_API_KEY).');
    }
    this.anthropic ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    return this.anthropic;
  }

  async resolveSlug(slug: string): Promise<{ tenantId: string; branchId: string }> {
    const snap = await this.firebase.db.collection(PUBLIC_SLUGS_COLLECTION).doc(slug).get();
    const tenantId = String(snap.data()?.['tenantId'] ?? '');
    const branchId = String(snap.data()?.['branchId'] ?? '');
    if (!snap.exists || !tenantId || !branchId) throw new NotFoundException('Salon bulunamadı.');
    return { tenantId, branchId };
  }

  private branchRef(tenantId: string, branchId: string) {
    return this.firebase.db.doc(`tenants/${tenantId}/beautyBranches/${branchId}`);
  }

  async getSettings(tenantId: string, branchId: string): Promise<AiAssistantSettings> {
    const snap = await this.branchRef(tenantId, branchId).get();
    const raw = (snap.data()?.['aiAssistant'] ?? {}) as Record<string, unknown>;
    return { enabled: raw['enabled'] === true, instructions: str(raw['instructions']) };
  }

  async saveSettings(tenantId: string, branchId: string, patch: Partial<AiAssistantSettings>, userId: string) {
    const ref = this.branchRef(tenantId, branchId);
    const snap = await ref.get();
    if (!snap.exists) throw new NotFoundException('Şube bulunamadı.');
    const current = await this.getSettings(tenantId, branchId);
    const next: AiAssistantSettings = {
      enabled: patch.enabled ?? current.enabled,
      instructions: patch.instructions !== undefined ? patch.instructions.trim() : current.instructions,
    };
    await ref.set(
      { aiAssistant: { ...next, updatedAt: new Date().toISOString(), updatedBy: userId } },
      { merge: true },
    );
    return next;
  }

  async usage(tenantId: string, month = istanbulNow().date.slice(0, 7)) {
    const snap = await this.firebase.db.doc(`tenants/${tenantId}/beautyAiUsage/${month}`).get();
    const d = snap.data() ?? {};
    return {
      month,
      messages: Number(d['messages'] ?? 0),
      bookings: Number(d['bookings'] ?? 0),
      inputTokens: Number(d['inputTokens'] ?? 0),
      outputTokens: Number(d['outputTokens'] ?? 0),
    };
  }

  async chat(input: AiChatInput): Promise<AiChatResult> {
    const message = input.message.trim().slice(0, 2000);
    const { tenantId, branchId } = await this.resolveSlug(input.slug);
    const settings = await this.getSettings(tenantId, branchId);
    if (!settings.enabled && !input.ignoreDisabled) {
      throw new PreconditionFailedException('Bu salonun AI asistanı kapalı.');
    }
    const client = this.client();
    const salon = await this.booking.info(input.slug);

    const conversationId =
      input.conversationId && CONVERSATION_ID.test(input.conversationId)
        ? input.conversationId
        : `c_${randomBytes(12).toString('hex')}`;
    const convRef = this.firebase.db.doc(`tenants/${tenantId}/beautyAiConversations/${conversationId}`);
    const convSnap = await convRef.get();
    const conv = convSnap.data() ?? {};
    let history: Msg[] = [];
    const lastAt = Date.parse(String(conv['lastMessageAt'] ?? ''));
    if (
      convSnap.exists &&
      conv['branchId'] === branchId &&
      Number.isFinite(lastAt) &&
      Date.now() - lastAt < CONVERSATION_IDLE_MS &&
      typeof conv['messagesJson'] === 'string' &&
      conv['messagesJson'].length < MAX_HISTORY_CHARS
    ) {
      try {
        history = JSON.parse(conv['messagesJson']) as Msg[];
      } catch {
        history = [];
      }
    }

    const messages: Msg[] = [...history, { role: 'user', content: message }];
    const now = istanbulNow();
    const salonContext = [
      `Bugün: ${now.date} ${now.weekday}, saat ${now.time} (Türkiye saati).`,
      `Salon: ${salon.businessName} - ${salon.branchName}.`,
      salon.address ? `Adres: ${[salon.address, salon.district, salon.city].filter(Boolean).join(', ')}.` : '',
      salon.phone ? `Salon telefonu: ${salon.phone}.` : '',
      `Kanal: ${input.channel === 'whatsapp' ? 'WhatsApp (müşterinin telefonu zaten belli, tekrar sorma)' : input.channel === 'panel_test' ? 'Salon sahibinin test sohbeti' : 'Web sohbeti'}.`,
      settings.instructions ? `Salonun ek talimatları (kurallara aykırı değilse uy):\n${settings.instructions}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const bookings: AiBookingResult[] = [];
    let reply = '';
    let inputTokens = 0;
    let outputTokens = 0;
    const model = this.model();
    const useFallbacks = /^claude-(opus-5|fable-5|mythos-5|sonnet-5-5)/.test(model);

    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const res = await client.beta.messages.create({
          model,
          max_tokens: 4096,
          system: [
            { type: 'text', text: AI_ASSISTANT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
            { type: 'text', text: salonContext },
          ],
          tools: AI_ASSISTANT_TOOLS,
          messages,
          output_config: { effort: 'low' },
          ...(useFallbacks
            ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
            : {}),
        });
        inputTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0);
        outputTokens += res.usage.output_tokens;
        // İçeriği olduğu gibi sakla: düşünce ve fallback blokları sonraki turda aynen geri gitmeli.
        messages.push({ role: 'assistant', content: res.content });

        if (res.stop_reason === 'refusal') {
          reply = FALLBACK_REPLY;
          break;
        }
        const toolUses = res.content.filter(
          (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
        );
        if (res.stop_reason !== 'tool_use' || toolUses.length === 0) {
          reply = res.content
            .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('\n')
            .trim();
          break;
        }
        const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
        for (const use of toolUses) {
          results.push(await this.runTool(use, input, bookings));
        }
        messages.push({ role: 'user', content: results });
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`AI asistan hatası (${tenantId}/${branchId}): ${(error as Error).message}`);
      throw new ServiceUnavailableException(FALLBACK_REPLY);
    }
    if (!reply) reply = FALLBACK_REPLY;

    // Konuşma tur ortasında kalmasın: son mesaj araç sonucuysa (tur sınırı) geçmişi kaydetme.
    const last = messages[messages.length - 1];
    const cleanEnd = last.role === 'assistant';
    const nowIso = new Date().toISOString();
    await convRef.set(
      {
        id: conversationId,
        branchId,
        channel: input.channel,
        customerPhone: input.customerPhone ?? conv['customerPhone'] ?? null,
        messagesJson: cleanEnd ? JSON.stringify(messages) : JSON.stringify(history),
        lastUserMessage: message,
        lastReply: reply,
        turns: (history.length ? Number(conv['turns'] ?? 0) : 0) + 1,
        bookingIds: [
          ...((history.length ? (conv['bookingIds'] as string[]) : null) ?? []),
          ...bookings.map((b) => b.id).filter((id): id is string => Boolean(id)),
        ],
        createdAt: history.length ? (conv['createdAt'] ?? nowIso) : nowIso,
        lastMessageAt: nowIso,
      },
      { merge: false },
    );
    if (input.channel !== 'panel_test') {
      await this.firebase.db
        .doc(`tenants/${tenantId}/beautyAiUsage/${istanbulNow().date.slice(0, 7)}`)
        .set(
          {
            messages: FieldValue.increment(1),
            bookings: FieldValue.increment(bookings.filter((b) => !b.dryRun).length),
            inputTokens: FieldValue.increment(inputTokens),
            outputTokens: FieldValue.increment(outputTokens),
            updatedAt: nowIso,
          },
          { merge: true },
        )
        .catch((e: Error) => this.logger.warn(`AI kullanım sayacı yazılamadı: ${e.message}`));
    }
    return { conversationId, reply, bookings };
  }

  private async runTool(
    use: Anthropic.Beta.BetaToolUseBlock,
    input: AiChatInput,
    bookings: AiBookingResult[],
  ): Promise<Anthropic.Beta.BetaToolResultBlockParam> {
    const args = (use.input ?? {}) as Record<string, unknown>;
    const ok = (data: unknown): Anthropic.Beta.BetaToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: use.id,
      content: JSON.stringify(data),
    });
    const fail = (msg: string): Anthropic.Beta.BetaToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: use.id,
      content: msg,
      is_error: true,
    });
    const slug = input.slug;
    try {
      switch (use.name) {
        case 'get_salon_info':
          return ok(await this.booking.info(slug));
        case 'list_services':
          return ok(await this.booking.services(slug));
        case 'list_staff':
          return ok(await this.booking.staff(slug, str(args['service_id']) || undefined));
        case 'find_available_slots': {
          const date = str(args['date']);
          const serviceId = str(args['service_id']);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !serviceId) return fail('Geçersiz tarih veya hizmet.');
          if (date < istanbulNow().date) return fail('Geçmiş bir tarih seçildi.');
          const res = await this.booking.slots(slug, date, serviceId, str(args['staff_id']) || undefined);
          return ok({
            date: res.date,
            durationMin: res.durationMin,
            times: res.slots.map((s) => s.time),
            note: res.slots.length === 0 ? 'Bu gün için boş saat yok veya salon kapalı.' : undefined,
          });
        }
        case 'book_appointment':
          return await this.bookFromTool(use, args, input, bookings, ok, fail);
        default:
          return fail(`Bilinmeyen araç: ${use.name}`);
      }
    } catch (error) {
      if (error instanceof HttpException) return fail(error.message);
      throw error;
    }
  }

  private async bookFromTool(
    _use: Anthropic.Beta.BetaToolUseBlock,
    args: Record<string, unknown>,
    input: AiChatInput,
    bookings: AiBookingResult[],
    ok: (data: unknown) => Anthropic.Beta.BetaToolResultBlockParam,
    fail: (msg: string) => Anthropic.Beta.BetaToolResultBlockParam,
  ) {
    const serviceId = str(args['service_id']);
    const date = str(args['date']);
    const time = str(args['time']);
    const fullName = str(args['full_name']).slice(0, 80);
    const phone = (str(args['phone']) || input.customerPhone || '').replace(/[^\d+]/g, '');
    const staffId = str(args['staff_id']) || undefined;
    if (args['kvkk_consent'] !== true) return fail('KVKK onayı alınmadan randevu oluşturulamaz. Müşteriye sor.');
    if (!serviceId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
      return fail('Hizmet, tarih veya saat eksik/geçersiz.');
    }
    if (fullName.length < 2) return fail('Müşterinin ad soyadı eksik.');
    if (phone.length < 7) return fail('Geçerli bir telefon numarası gerekli.');
    if (bookings.length >= 3) return fail('Bir konuşmada en fazla 3 randevu oluşturulabilir.');

    if (input.dryRun) {
      const slots = await this.booking.slots(input.slug, date, serviceId, staffId);
      if (!slots.slots.some((s) => s.time === time)) return fail('Bu saat dolu veya uygun değil.');
      const service = (await this.booking.services(input.slug)).find((s) => s.id === serviceId);
      const result: AiBookingResult = {
        id: null,
        serviceName: service?.name ?? 'Hizmet',
        staffName: null,
        startAt: `${date}T${time}:00+03:00`,
        dryRun: true,
      };
      bookings.push(result);
      return ok({ ...result, status: 'test', note: 'Test modu: randevu kaydedilmedi ama saat uygun.' });
    }

    const created = await this.booking.book(
      input.slug,
      {
        serviceId,
        staffId,
        date,
        time,
        fullName,
        phone,
        notes: str(args['notes']).slice(0, 1000) || undefined,
        kvkkConsent: true,
      },
      input.channel === 'whatsapp' ? 'ai_whatsapp' : 'ai_assistant',
    );
    bookings.push({
      id: created.id,
      serviceName: created.serviceName,
      staffName: created.staffName,
      startAt: created.startAt,
      dryRun: false,
    });
    return ok({
      status: created.status,
      serviceName: created.serviceName,
      staffName: created.staffName,
      startAt: created.startAt,
      branchName: created.branchName,
      branchPhone: created.branchPhone,
    });
  }
}

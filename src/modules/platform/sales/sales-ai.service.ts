import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SALES_REPLY_INTENTS, SalesChannel, SalesReplyIntent } from './sales.config';

/**
 * Satış asistanının Claude çağrıları: kişiye özel mesaj yazımı, gelen cevabın sınıflandırılması ve
 * reklam metni üretimi. Anahtar `ANTHROPIC_API_KEY` (Beauty AI asistanıyla aynı), model
 * `SALES_AI_MODEL` ile değiştirilebilir. Çıktılar JSON şemasıyla (structured outputs) alınır.
 */

const DEFAULT_MODEL = 'claude-opus-5-5';

export interface ComposeInput {
  channel: SalesChannel;
  kind: string;
  leadSummary: string;
  productFacts: string | null;
  priceText: string | null;
  history: string | null;
  baseTemplate: { subject: string | null; body: string } | null;
  instructions: string | null;
}

export interface ComposeOutput {
  subject: string;
  body: string;
  notes: string;
}

export interface ReplyAnalysis {
  intent: SalesReplyIntent;
  sentiment: 'positive' | 'neutral' | 'negative';
  summary: string;
  suggestedReply: string;
  followUpInDays: number;
}

export interface AdCopyInput {
  productLabel: string;
  productFacts: string | null;
  platform: 'meta' | 'google';
  goal: string;
  area: string;
  stats: string;
  priceText: string | null;
  instructions: string | null;
}

export interface AdCopyOutput {
  audiences: { name: string; targeting: string; why: string }[];
  ads: { headline: string; primaryText: string; description: string; cta: string }[];
  keywords: string[];
  negativeKeywords: string[];
  tips: string[];
}

const SYSTEM = `Sen Odivon'un satış asistanısın. Odivon; spor salonu, veteriner, kuaför, güzellik merkezi ve diyetisyen gibi işletmelere yönetim yazılımı satar.
Kurallar:
- Türkçe, samimi ama profesyonel yaz; "siz" diye hitap et.
- Sadece verilen ürün bilgilerindeki özellikleri kullan; özellik, rakam, müşteri sayısı veya referans uydurma.
- Fiyatı sadece verildiyse yaz; bunun için metinde {{fiyat}} yer tutucusunu kullanabilirsin. Geçerlilik için {{gecerlilik}}, demo bağlantısı için {{demo_linki}} kullanılabilir.
- Lead hakkındaki bilgileri (ilçe, yorumlar, eksikler) kısa ve doğal kullan; işletmeyi eleştirme.
- Abartılı vaat, baskı, büyük harfle bağırma ve emoji yağmuru yok.`;

const CHANNEL_RULES: Record<SalesChannel, string> = {
  email: 'E-posta: konu en fazla 70 karakter; gövde 80-180 kelime, kısa paragraflar, sonunda tek net çağrı (demo). İmza "Odivon Ekibi".',
  whatsapp: 'WhatsApp: en fazla 600 karakter, 2-4 kısa paragraf, en fazla 2 emoji, sonunda tek soru. Konu boş bırak.',
  sms: 'SMS: en fazla 300 karakter, tek paragraf, emoji yok, sonunda odivon.com. Konu boş bırak.',
};

@Injectable()
export class SalesAiService {
  private readonly logger = new Logger(SalesAiService.name);
  private client: Anthropic | null = null;

  configured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  model(): string {
    return process.env.SALES_AI_MODEL || DEFAULT_MODEL;
  }

  private anthropic(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('AI satış asistanı yapılandırılmadı (ANTHROPIC_API_KEY).');
    this.client ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    return this.client;
  }

  /** JSON şemalı tek çağrı. Testlerde bu metot taklit edilir. */
  async json<T>(prompt: string, schema: Record<string, unknown>, effort: 'low' | 'medium' = 'low'): Promise<T> {
    // Güvenlik sınıflandırıcısı reddederse istek aynı çağrıda uygun modelde yeniden çalışır.
    const res = await this.anthropic().beta.messages.create({
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      model: this.model(),
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort, format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') {
      throw new ServiceUnavailableException('AI bu isteği yanıtlamadı; metni elle yazın.');
    }
    const text = res.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') throw new ServiceUnavailableException('AI boş yanıt döndü');
    try {
      return JSON.parse(text.text) as T;
    } catch (error) {
      this.logger.warn(`AI JSON parse failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('AI yanıtı okunamadı, tekrar deneyin');
    }
  }

  async compose(input: ComposeInput): Promise<ComposeOutput> {
    const prompt = [
      `Görev: Bu işletmeye ${channelName(input.channel)} ile gönderilecek ${kindName(input.kind)} mesajını yaz.`,
      CHANNEL_RULES[input.channel],
      `\n## İşletme\n${input.leadSummary}`,
      input.productFacts ? `\n## Ürün bilgileri (sadece bunları kullan)\n${input.productFacts}` : '',
      input.priceText ? `\n## Fiyat\n${input.priceText} ({{fiyat}} yer tutucusu bu değeri basar)` : '\n## Fiyat\nFiyat verilmedi; fiyat yazma.',
      input.history ? `\n## Önceki iletişim\n${input.history}` : '',
      input.baseTemplate
        ? `\n## Temel alınacak şablon (bu işletmeye göre uyarlayıp kısalt)\nKonu: ${input.baseTemplate.subject ?? ''}\n${input.baseTemplate.body.slice(0, 4000)}`
        : '',
      input.instructions ? `\n## Satış temsilcisinin notu\n${input.instructions}` : '',
      '\n"notes" alanına bu işletme için neyi vurguladığını tek cümleyle yaz.',
    ]
      .filter(Boolean)
      .join('\n');
    const out = await this.json<ComposeOutput>(
      prompt,
      {
        type: 'object',
        additionalProperties: false,
        required: ['subject', 'body', 'notes'],
        properties: {
          subject: { type: 'string' },
          body: { type: 'string' },
          notes: { type: 'string' },
        },
      },
      'medium',
    );
    return { subject: input.channel === 'email' ? out.subject.trim() : '', body: out.body.trim(), notes: out.notes.trim() };
  }

  async classifyReply(input: { text: string; leadSummary: string; lastMessage: string | null }): Promise<ReplyAnalysis> {
    const prompt = [
      'Görev: Potansiyel müşteriden gelen cevabı sınıflandır ve kısa bir cevap taslağı yaz.',
      `Niyet seçenekleri: interested (ilgili), price_question (fiyat soruyor), demo_request (demo/görüşme istiyor), question (ürün sorusu), later (şimdi değil/sonra), not_interested (istemiyor), unsubscribe (mesaj atmayın/listeden çıkarın), other.`,
      'followUpInDays: bir sonraki takip için önerilen gün (istemiyor/unsubscribe ise 0).',
      'suggestedReply: aynı kanaldan gönderilecek, en fazla 500 karakterlik cevap; unsubscribe ise kısa bir özür ve onay.',
      `\n## İşletme\n${input.leadSummary}`,
      input.lastMessage ? `\n## Bizim son mesajımız\n${input.lastMessage.slice(0, 1500)}` : '',
      `\n## Gelen cevap\n${input.text.slice(0, 4000)}`,
    ]
      .filter(Boolean)
      .join('\n');
    const out = await this.json<ReplyAnalysis>(prompt, {
      type: 'object',
      additionalProperties: false,
      required: ['intent', 'sentiment', 'summary', 'suggestedReply', 'followUpInDays'],
      properties: {
        intent: { type: 'string', enum: [...SALES_REPLY_INTENTS] },
        sentiment: { type: 'string', enum: ['positive', 'neutral', 'negative'] },
        summary: { type: 'string' },
        suggestedReply: { type: 'string' },
        followUpInDays: { type: 'integer' },
      },
    });
    return {
      ...out,
      intent: (SALES_REPLY_INTENTS as readonly string[]).includes(out.intent) ? out.intent : 'other',
      followUpInDays: Math.max(0, Math.min(90, Math.round(out.followUpInDays || 0))),
    };
  }

  async adCopy(input: AdCopyInput): Promise<AdCopyOutput> {
    const platformRules =
      input.platform === 'meta'
        ? 'Meta (Facebook/Instagram): 4 reklam; başlık en fazla 40, ana metin en fazla 300, açıklama en fazla 30 karakter. 3 kitle önerisi (konum, ilgi alanı, işletme sahibi/yönetici hedeflemesi).'
        : 'Google Ads (arama): 4 duyarlı arama reklamı; başlık en fazla 30, açıklama en fazla 90 karakter (primaryText alanına ikinci açıklamayı yaz). 15-25 anahtar kelime ve 5-10 negatif anahtar kelime. 3 kitle/kampanya önerisi.';
    const prompt = [
      `Görev: ${input.productLabel} için ${input.platform === 'meta' ? 'Meta' : 'Google'} reklam kampanyası hazırla. Hedef müşteri işletme sahipleridir (B2B).`,
      platformRules,
      `Kampanya amacı: ${input.goal}. Bölge: ${input.area}.`,
      input.productFacts ? `\n## Ürün bilgileri (sadece bunları kullan)\n${input.productFacts}` : '',
      input.priceText ? `\n## Fiyat\n${input.priceText}` : '',
      `\n## Lead verisinden pazar özeti\n${input.stats}`,
      input.instructions ? `\n## Not\n${input.instructions}` : '',
      '\n"tips" alanına bütçe ve test için en fazla 4 kısa öneri yaz. Meta için keywords ve negativeKeywords boş liste olabilir.',
    ]
      .filter(Boolean)
      .join('\n');
    return this.json<AdCopyOutput>(
      prompt,
      {
        type: 'object',
        additionalProperties: false,
        required: ['audiences', 'ads', 'keywords', 'negativeKeywords', 'tips'],
        properties: {
          audiences: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'targeting', 'why'],
              properties: { name: { type: 'string' }, targeting: { type: 'string' }, why: { type: 'string' } },
            },
          },
          ads: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['headline', 'primaryText', 'description', 'cta'],
              properties: {
                headline: { type: 'string' },
                primaryText: { type: 'string' },
                description: { type: 'string' },
                cta: { type: 'string' },
              },
            },
          },
          keywords: { type: 'array', items: { type: 'string' } },
          negativeKeywords: { type: 'array', items: { type: 'string' } },
          tips: { type: 'array', items: { type: 'string' } },
        },
      },
      'medium',
    );
  }
}

function channelName(c: SalesChannel) {
  return c === 'email' ? 'e-posta' : c === 'whatsapp' ? 'WhatsApp' : 'SMS';
}

function kindName(k: string) {
  return k === 'offer' ? 'teklif' : k === 'ad' ? 'kampanya' : k === 'followup' ? 'takip' : 'bilgilendirme';
}

/** AI yokken basit anahtar kelime sınıflandırması (panel yine de cevabı kaydeder). */
export function classifyReplyHeuristic(text: string): SalesReplyIntent {
  const t = text.toLocaleLowerCase('tr-TR');
  if (/(listeden çıkar|mesaj atmay|rahatsız etmey|\bret\b|abonelikten|göndermeyin|istemiyorum mesaj)/.test(t)) return 'unsubscribe';
  if (/(ilgilenmiyor|gerek yok|istemiyoruz|kullanıyoruz zaten|hayır teşekkür)/.test(t)) return 'not_interested';
  if (/(demo|görüşelim|arayın|toplantı|randevu ayarla)/.test(t)) return 'demo_request';
  if (/(fiyat|ücret|kaç para|ne kadar|indirim)/.test(t)) return 'price_question';
  if (/(sonra|şu an değil|ileride|müsait değil|yoğunuz)/.test(t)) return 'later';
  if (/(ilgileniyor|olur|tamam|merak|detay|bilgi alabilir)/.test(t)) return 'interested';
  if (t.includes('?')) return 'question';
  return 'other';
}

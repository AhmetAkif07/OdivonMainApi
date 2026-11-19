import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { SALES_REPLY_INTENTS, SalesChannel, SalesReplyIntent } from './sales.config';

/**
 * Satış asistanının AI çağrıları: kişiye özel mesaj, gelen cevabın sınıflandırılması, görüşme
 * hazırlığı, haftalık rapor yorumu ve reklam metni. Çıktılar JSON şemasıyla alınır.
 *
 * Sağlayıcı:
 * - `GEMINI_API_KEY` tanımlıysa Google Gemini (ücretsiz katman kullanılabilir), model `SALES_GEMINI_MODEL`.
 * - yoksa `ANTHROPIC_API_KEY` ile Claude, model `SALES_AI_MODEL`.
 * `SALES_AI_PROVIDER=gemini|anthropic` ikisi de tanımlıyken seçimi zorlar.
 */

const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type SalesAiProvider = 'gemini' | 'anthropic';

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

export interface CallPrepInput {
  leadSummary: string;
  productLabel: string | null;
  productFacts: string | null;
  priceText: string | null;
  history: string | null;
  scoreFactors: string[];
  instructions: string | null;
}

export interface CallPrepOutput {
  goal: string;
  opener: string;
  questions: string[];
  talkingPoints: string[];
  objections: { objection: string; answer: string }[];
  closing: string;
  avoid: string[];
  voicemail: string;
}

export interface ReportInsights {
  headline: string;
  wins: string[];
  issues: string[];
  actions: string[];
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

  provider(): SalesAiProvider | null {
    const gemini = Boolean(process.env.GEMINI_API_KEY);
    const anthropic = Boolean(process.env.ANTHROPIC_API_KEY);
    const forced = process.env.SALES_AI_PROVIDER;
    if (forced === 'anthropic' && anthropic) return 'anthropic';
    if (forced === 'gemini' && gemini) return 'gemini';
    return gemini ? 'gemini' : anthropic ? 'anthropic' : null;
  }

  configured(): boolean {
    return this.provider() !== null;
  }

  model(): string {
    return this.provider() === 'gemini' ? process.env.SALES_GEMINI_MODEL || DEFAULT_GEMINI_MODEL : process.env.SALES_AI_MODEL || DEFAULT_MODEL;
  }

  private anthropic(): Anthropic {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new ServiceUnavailableException('AI satış asistanı yapılandırılmadı (ANTHROPIC_API_KEY).');
    this.client ??= new Anthropic({ apiKey, maxRetries: 2, timeout: 60_000 });
    return this.client;
  }

  /** JSON şemalı tek çağrı. Testlerde bu metot taklit edilir. */
  async json<T>(prompt: string, schema: Record<string, unknown>, effort: 'low' | 'medium' = 'low'): Promise<T> {
    const provider = this.provider();
    if (!provider) throw new ServiceUnavailableException('AI satış asistanı yapılandırılmadı (GEMINI_API_KEY).');
    if (provider === 'gemini') return this.parse<T>(await this.gemini(prompt, schema));
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
    return this.parse<T>(text.text);
  }

  private parse<T>(raw: string): T {
    // Gemini bazen JSON'u ```json bloğuna sarar.
    const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      return JSON.parse(text) as T;
    } catch (error) {
      this.logger.warn(`AI JSON parse failed: ${(error as Error).message}`);
      throw new ServiceUnavailableException('AI yanıtı okunamadı, tekrar deneyin');
    }
  }

  /**
   * Gemini generateContent (REST, Workers'da SDK gerekmez). Önce JSON şemasıyla istenir; şema
   * reddedilirse (400) şema metne eklenip yalnızca JSON çıktısı istenir.
   */
  private async gemini(prompt: string, schema: Record<string, unknown>): Promise<string> {
    const key = process.env.GEMINI_API_KEY!;
    const url = `${GEMINI_BASE}/${encodeURIComponent(this.model())}:generateContent`;
    const call = async (withSchema: boolean) => {
      const body = {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: withSchema ? prompt : `${prompt}\n\nYanıtı yalnızca şu JSON şemasına uyan tek bir JSON nesnesi olarak ver:\n${JSON.stringify(schema)}` }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          ...(withSchema ? { responseJsonSchema: schema } : {}),
          maxOutputTokens: 8192,
          temperature: 0.7,
        },
      };
      return fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    };
    let res = await call(true);
    if (res.status === 400) {
      this.logger.warn(`Gemini rejected the JSON schema: ${(await res.text()).slice(0, 300)}`);
      res = await call(false);
    }
    if (res.status === 429) throw new ServiceUnavailableException('Gemini ücretsiz kullanım sınırı doldu; biraz sonra tekrar deneyin.');
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      this.logger.warn(`Gemini error ${res.status}: ${detail}`);
      throw new ServiceUnavailableException(res.status === 403 || res.status === 401 ? 'Gemini anahtarı geçersiz (GEMINI_API_KEY).' : `Gemini hatası (${res.status}), tekrar deneyin.`);
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
    };
    if (data.promptFeedback?.blockReason) throw new ServiceUnavailableException('AI bu isteği yanıtlamadı; metni elle yazın.');
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === 'string')
      .map((p) => p.text)
      .join('');
    if (!text) {
      throw new ServiceUnavailableException(cand?.finishReason === 'SAFETY' ? 'AI bu isteği yanıtlamadı; metni elle yazın.' : 'AI boş yanıt döndü');
    }
    return text;
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

const STRING_LIST = { type: 'array', items: { type: 'string' } } as const;

/** Görüşme hazırlığı ve haftalık rapor yorumu (aynı istemci ve sistem metni). */
export async function aiCallPrep(ai: SalesAiService, input: CallPrepInput): Promise<CallPrepOutput> {
  const prompt = [
    `Görev: Satış temsilcisi bu işletmeyi telefonla arayacak${input.productLabel ? ` (ürün: ${input.productLabel})` : ''}. Kısa, konuşur gibi okunacak bir görüşme hazırlığı yaz.`,
    'goal: bu aramanın tek cümlelik hedefi (çoğunlukla demo randevusu).',
    'opener: ilk 20 saniyede söylenecek, kendini ve arama nedenini tanıtan 2-3 cümle; işletmeye özel bir ayrıntı kullan.',
    'questions: ihtiyacı anlamak için 4-6 açık uçlu soru.',
    'talkingPoints: bu işletmeye göre öne çıkarılacak 3-5 nokta (sadece ürün bilgilerindeki özellikler).',
    'objections: bu işletmenin söyleyebileceği 4-6 itiraz ("pahalı", "zaten X kullanıyoruz", "vaktim yok", "Excel yetiyor" gibi) ve her birine 1-3 cümlelik cevap.',
    'closing: görüşmeyi demo veya sonraki adıma bağlayan kapanış cümlesi.',
    'avoid: bu aramada söylenmemesi gereken 2-3 şey.',
    'voicemail: ulaşılamazsa bırakılacak 2 cümlelik sesli mesaj ya da WhatsApp notu.',
    `\n## İşletme\n${input.leadSummary}`,
    input.scoreFactors.length ? `\n## Skor etkenleri\n${input.scoreFactors.join('; ')}` : '',
    input.productFacts ? `\n## Ürün bilgileri (sadece bunları kullan)\n${input.productFacts}` : '',
    input.priceText ? `\n## Fiyat\n${input.priceText}` : '\n## Fiyat\nFiyat verilmedi; rakam söyleme, fiyatı demoda konuşmayı öner.',
    input.history ? `\n## Önceki iletişim\n${input.history}` : '',
    input.instructions ? `\n## Satış temsilcisinin notu\n${input.instructions}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return ai.json<CallPrepOutput>(
    prompt,
    {
      type: 'object',
      additionalProperties: false,
      required: ['goal', 'opener', 'questions', 'talkingPoints', 'objections', 'closing', 'avoid', 'voicemail'],
      properties: {
        goal: { type: 'string' },
        opener: { type: 'string' },
        questions: STRING_LIST,
        talkingPoints: STRING_LIST,
        objections: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['objection', 'answer'],
            properties: { objection: { type: 'string' }, answer: { type: 'string' } },
          },
        },
        closing: { type: 'string' },
        avoid: STRING_LIST,
        voicemail: { type: 'string' },
      },
    },
    'medium',
  );
}

export async function aiReportInsights(ai: SalesAiService, statsText: string): Promise<ReportInsights> {
  const prompt = [
    'Görev: Aşağıdaki haftalık satış verisini satış yöneticisi için yorumla. Sadece verideki rakamları kullan, rakam uydurma.',
    'headline: haftanın tek cümlelik özeti.',
    'wins: iyi giden 2-4 şey (kanal, şablon, ürün; oranlarla).',
    'issues: dikkat isteyen 2-4 şey (düşük açılma/cevap, başarısız gönderim, bekleyen takipler).',
    'actions: gelecek hafta için 3-5 somut öneri (hangi şablonu/kanalı artır, hangisini değiştir, kimleri ara).',
    'Veri azsa bunu söyle ve kesin yargıdan kaçın.',
    `\n## Veri\n${statsText}`,
  ].join('\n');
  return ai.json<ReportInsights>(prompt, {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'wins', 'issues', 'actions'],
    properties: { headline: { type: 'string' }, wins: STRING_LIST, issues: STRING_LIST, actions: STRING_LIST },
  });
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

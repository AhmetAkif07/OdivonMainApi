import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { ProductModule } from '../../../shared/authorization/constants';
import { PRODUCT_LABELS } from '../tickets/ticket-grouping';
import { leadProducts } from '../ai-research/lead-fields';
import { ReportInsights, SalesAiService, aiReportInsights } from './sales-ai.service';
import { SalesAssistantService } from './sales-assistant.service';
import { SalesChannelsService } from './sales-channels.service';

type Doc = Record<string, any>;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Türkiye saati (UTC+3, yaz saati yok). */
const TR_OFFSET_MS = 3 * HOUR_MS;
/** Otomatik rapor pazartesi bu saatten (TR) sonra üretilir. */
const WEEKLY_REPORT_HOUR = 8;
const POSITIVE = new Set(['interested', 'price_question', 'demo_request', 'question']);

export interface ReportMetrics {
  sent: number;
  failed: number;
  emailSent: number;
  opened: number;
  clicked: number;
  replies: number;
  positive: number;
  demos: number;
  won: number;
}

export interface ReportTotals extends ReportMetrics {
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
  wonMrr: number;
  calls: number;
}

type Bucket = ReportMetrics & { key: string; label: string };

const emptyMetrics = (): ReportMetrics => ({ sent: 0, failed: 0, emailSent: 0, opened: 0, clicked: 0, replies: 0, positive: 0, demos: 0, won: 0 });

const CHANNEL_LABEL: Record<string, string> = { email: 'E-posta', whatsapp: 'WhatsApp', sms: 'SMS' };

/** Haftanın başlangıcı: TR saatiyle pazartesi 00:00 (UTC olarak). weeksBack=1 geçen hafta. */
export function istanbulWeekStart(now: Date, weeksBack = 0): Date {
  const local = new Date(now.getTime() + TR_OFFSET_MS);
  const dayIndex = (local.getUTCDay() + 6) % 7;
  const localMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - dayIndex * DAY_MS;
  return new Date(localMidnight - TR_OFFSET_MS - weeksBack * 7 * DAY_MS);
}

/** Rapor kimliği: haftanın pazartesi günü (TR), YYYY-MM-DD. */
export function weekId(start: Date): string {
  return new Date(start.getTime() + TR_OFFSET_MS).toISOString().slice(0, 10);
}

function rate(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : null;
}

function productLabel(p: string | null | undefined): string {
  if (!p) return 'Ürün yok';
  return PRODUCT_LABELS[p as ProductModule] ?? p;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Haftalık satış raporu: gönderilen mesajların kanal / şablon / ürün bazında açılma, tıklama,
 * cevap, demo ve kazanım sonuçları, önceki haftayla karşılaştırma ve AI yorumu.
 * Cevap, demo ve kazanım o lead'e ondan önce giden son mesaja (şablona) yazılır.
 */
@Injectable()
export class SalesReportService {
  private readonly logger = new Logger(SalesReportService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly ai: SalesAiService,
    private readonly assistant: SalesAssistantService,
    private readonly channels: SalesChannelsService,
  ) {}

  private reports() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesReports);
  }

  async list() {
    const snap = await this.reports().orderBy('weekStart', 'desc').limit(12).get();
    return snap.docs
      .map((d) => d.data() as Doc)
      .sort((a, b) => String(b.weekStart).localeCompare(String(a.weekStart)))
      .map((r) => ({
        id: r.id,
        weekStart: r.weekStart,
        weekEnd: r.weekEnd,
        partial: r.partial,
        totals: r.totals,
        headline: r.insights?.headline ?? null,
        generatedAt: r.generatedAt,
      }));
  }

  async get(id: string) {
    const snap = await this.reports().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Rapor bulunamadı');
    return snap.data();
  }

  /** last = geçen hafta (tam), current = bu hafta şimdiye kadar. Aynı hafta yeniden üretilirse üzerine yazılır. */
  async generate(opts: { week?: 'last' | 'current'; now?: Date }, by: { uid: string; email: string | null }) {
    const now = opts.now ?? new Date();
    const start = istanbulWeekStart(now, opts.week === 'current' ? 0 : 1);
    const end = new Date(start.getTime() + 7 * DAY_MS);
    const prevStart = new Date(start.getTime() - 7 * DAY_MS);
    const startIso = start.toISOString();
    const endIso = end.toISOString();
    const prevIso = prevStart.toISOString();
    // Atıf için 30 gün önceki mesajlar da okunur.
    const offersFrom = new Date(prevStart.getTime() - 30 * DAY_MS).toISOString();

    const db = this.firebase.db;
    const [offerSnap, actSnap, leadSnap] = await Promise.all([
      db.collection(ROOT_COLLECTION.salesOffers).where('createdAt', '>=', offersFrom).get(),
      db.collection(ROOT_COLLECTION.salesActivities).where('createdAt', '>=', prevIso).get(),
      db.collection(ROOT_COLLECTION.aiLeads).orderBy('lastSeenAt', 'desc').limit(2000).select('name', 'pipeline').get(),
    ]);
    const offers: Doc[] = offerSnap.docs.map((d) => ({ ...(d.data() as Doc), id: d.id }));
    const acts = actSnap.docs.map((d) => d.data() as Doc);
    const offersById = new Map(offers.map((o) => [o.id, o]));
    const offersByLead = new Map<string, Doc[]>();
    for (const o of offers) {
      if (o.status === 'failed') continue;
      const list = offersByLead.get(o.leadId) ?? [];
      list.push(o);
      offersByLead.set(o.leadId, list);
    }
    const lastOfferBefore = (leadId: string, at: string): Doc | null => {
      const list = offersByLead.get(leadId) ?? [];
      let best: Doc | null = null;
      for (const o of list) if (o.createdAt <= at && (!best || o.createdAt > best.createdAt)) best = o;
      return best;
    };

    const priceCache = new Map<string, number | null>();
    const priceOf = async (product: string | null) => {
      const key = product ?? '';
      if (!priceCache.has(key)) priceCache.set(key, await this.assistant.livePrice(product));
      return priceCache.get(key) ?? 0;
    };

    const compute = async (fromIso: string, toIso: string, withBuckets: boolean) => {
      const totals = emptyMetrics();
      const buckets = { channel: new Map<string, Bucket>(), template: new Map<string, Bucket>(), product: new Map<string, Bucket>() };
      const bump = (o: Doc | null, field: keyof ReportMetrics) => {
        totals[field] += 1;
        if (!withBuckets || !o) return;
        const keys: [keyof typeof buckets, string, string][] = [
          ['channel', o.channel, CHANNEL_LABEL[o.channel] ?? o.channel],
          ['template', o.templateId ?? 'none', o.templateName ?? 'Şablonsuz / AI mesajı'],
          ['product', o.product ?? 'none', productLabel(o.product)],
        ];
        for (const [kind, key, label] of keys) {
          const map = buckets[kind];
          const b = map.get(key) ?? { key, label, ...emptyMetrics() };
          b[field] += 1;
          map.set(key, b);
        }
      };
      const inRange = (at: unknown) => typeof at === 'string' && at >= fromIso && at < toIso;

      for (const o of offers) {
        if (!inRange(o.createdAt)) continue;
        if (o.status === 'failed') {
          bump(o, 'failed');
          continue;
        }
        bump(o, 'sent');
        if (o.channel === 'email' && o.deliveryMode !== 'manual') {
          bump(o, 'emailSent');
          if ((o.openCount ?? 0) > 0) bump(o, 'opened');
          if ((o.clickCount ?? 0) > 0) bump(o, 'clicked');
        }
      }
      let calls = 0;
      const intents: Record<string, number> = {};
      for (const a of acts) {
        if (!inRange(a.createdAt)) continue;
        if (a.type === 'call') calls += 1;
        if (a.type === 'reply') {
          const o = (a.offerId && offersById.get(a.offerId)) || lastOfferBefore(a.leadId, a.createdAt);
          bump(o, 'replies');
          if (POSITIVE.has(a.intent)) bump(o, 'positive');
          intents[a.intent ?? 'other'] = (intents[a.intent ?? 'other'] ?? 0) + 1;
        }
      }
      for (const o of offers) if (inRange(o.demoRequestedAt)) bump(o, 'demos');
      let wonMrr = 0;
      for (const doc of leadSnap.docs) {
        const d = doc.data() as Doc;
        const wonAt = d.pipeline?.wonAt;
        if (d.pipeline?.status !== 'won' || !inRange(wonAt)) continue;
        bump(lastOfferBefore(doc.id, wonAt), 'won');
        wonMrr += await priceOf(leadProducts(d).products[0] ?? null);
      }
      const t: ReportTotals = {
        ...totals,
        openRate: rate(totals.opened, totals.emailSent),
        clickRate: rate(totals.clicked, totals.emailSent),
        replyRate: rate(totals.replies, totals.sent),
        wonMrr,
        calls,
      };
      const rows = (m: Map<string, Bucket>) =>
        [...m.values()]
          .map((b) => ({ ...b, openRate: rate(b.opened, b.emailSent), replyRate: rate(b.replies, b.sent) }))
          .sort((a, b) => b.won - a.won || b.positive - a.positive || b.sent - a.sent)
          .slice(0, 15);
      return { totals: t, intents, byChannel: rows(buckets.channel), byTemplate: rows(buckets.template), byProduct: rows(buckets.product) };
    };

    const cur = await compute(startIso, endIso, true);
    const prev = await compute(prevIso, startIso, false);

    const openFollowups = await db.collection(ROOT_COLLECTION.salesActivities).where('type', '==', 'followup').where('done', '==', false).get();
    const overdueFollowups = openFollowups.docs.filter((d) => String(d.data().dueAt ?? '') < now.toISOString()).length;

    const id = weekId(start);
    const report: Doc = {
      id,
      weekStart: startIso,
      weekEnd: endIso,
      partial: end.getTime() > now.getTime(),
      totals: cur.totals,
      prevTotals: prev.totals,
      intents: cur.intents,
      byChannel: cur.byChannel,
      byTemplate: cur.byTemplate,
      byProduct: cur.byProduct,
      overdueFollowups,
      insights: null as ReportInsights | null,
      insightsError: null as string | null,
      model: null as string | null,
      generatedAt: now.toISOString(),
      generatedBy: by.email ?? by.uid,
    };
    if (this.ai.configured() && (cur.totals.sent > 0 || cur.totals.replies > 0 || cur.totals.won > 0)) {
      try {
        report.insights = await aiReportInsights(this.ai, statsText(report));
        report.model = this.ai.model();
      } catch (error) {
        report.insightsError = (error as Error).message;
      }
    }
    await this.reports().doc(id).set(report);
    return report;
  }

  /**
   * Saatlik cron: pazartesi 08:00'den (TR) sonra geçen haftanın raporu yoksa üretir ve
   * SALES_REPORT_EMAIL tanımlıysa e-postayla gönderir.
   */
  async runWeekly(now = new Date()): Promise<{ generated: string | null; emailed: boolean }> {
    const local = new Date(now.getTime() + TR_OFFSET_MS);
    if (local.getUTCDay() !== 1 || local.getUTCHours() < WEEKLY_REPORT_HOUR) return { generated: null, emailed: false };
    const id = weekId(istanbulWeekStart(now, 1));
    const existing = await this.reports().doc(id).get();
    if (existing.exists && existing.data()?.partial === false) return { generated: null, emailed: false };
    const report = await this.generate({ week: 'last', now }, { uid: 'sales-automation', email: 'haftalik-rapor@odivon' });
    const emailed = await this.email(report).catch((error) => {
      this.logger.warn(`Weekly sales report e-mail failed: ${(error as Error).message}`);
      return false;
    });
    return { generated: id, emailed };
  }

  private async email(report: Doc): Promise<boolean> {
    const to = process.env.SALES_REPORT_EMAIL?.trim();
    if (!to || !this.channels.emailConfigured()) return false;
    const mailbox = await this.channels.resolveMailbox(null);
    if (!mailbox) return false;
    const text = statsText(report) + (report.insights ? `\n\n${insightsText(report.insights)}` : '');
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#0f172a"><h2 style="margin:0 0 12px">Haftalık satış raporu (${escapeHtml(report.id)})</h2><pre style="white-space:pre-wrap;font-family:inherit">${escapeHtml(text)}</pre><p style="color:#64748b">Ayrıntılar: Yönetim paneli › Satış &amp; Pazarlama › Rapor</p></div>`;
    const r = await this.channels.sendEmail(mailbox.resourceId, { to, subject: `Odivon haftalık satış raporu: ${report.id}`, html, text });
    return r.ok;
  }
}

function pct(v: number | null) {
  return v === null ? '-' : `%${v}`;
}

/** AI'ya ve e-postaya giden düz metin özet. */
export function statsText(r: Doc): string {
  const t = r.totals as ReportTotals;
  const p = r.prevTotals as ReportTotals | undefined;
  const vs = (k: keyof ReportTotals) => (p ? ` (önceki hafta ${p[k] ?? '-'})` : '');
  const lines = [
    `Hafta: ${r.id}${r.partial ? ' (devam ediyor)' : ''}`,
    `Gönderilen mesaj: ${t.sent}${vs('sent')}, başarısız: ${t.failed}`,
    `E-posta açılma: ${pct(t.openRate)}, tıklama: ${pct(t.clickRate)} (${t.emailSent} e-posta)`,
    `Cevap: ${t.replies}${vs('replies')}, olumlu: ${t.positive}, cevap oranı: ${pct(t.replyRate)}`,
    `Demo talebi: ${t.demos}${vs('demos')}, kazanılan: ${t.won}${vs('won')}, kazanılan aylık gelir: ${t.wonMrr} TL`,
    `Kayıtlı arama: ${t.calls}, gecikmiş takip: ${r.overdueFollowups ?? 0}`,
  ];
  const table = (title: string, rows: Doc[]) => {
    if (!rows?.length) return;
    lines.push(`\n${title}:`);
    for (const b of rows.slice(0, 8)) {
      lines.push(`- ${b.label}: ${b.sent} gönderim, açılma ${pct(b.openRate)}, ${b.replies} cevap (${b.positive} olumlu), ${b.demos} demo, ${b.won} kazanım`);
    }
  };
  table('Kanala göre', r.byChannel);
  table('Şablona göre', r.byTemplate);
  table('Ürüne göre', r.byProduct);
  const intents = Object.entries(r.intents ?? {});
  if (intents.length) lines.push(`\nCevap niyetleri: ${intents.map(([k, v]) => `${k} ${v}`).join(', ')}`);
  return lines.join('\n');
}

function insightsText(i: ReportInsights): string {
  const list = (title: string, items: string[]) => (items.length ? `${title}:\n${items.map((x) => `- ${x}`).join('\n')}` : '');
  return [i.headline, list('İyi gidenler', i.wins), list('Dikkat', i.issues), list('Öneriler', i.actions)].filter(Boolean).join('\n\n');
}

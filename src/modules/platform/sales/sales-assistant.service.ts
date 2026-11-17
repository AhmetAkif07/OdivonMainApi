import { Injectable, Logger, Optional } from '@nestjs/common';
import { FieldValue } from 'firebase-admin/firestore';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { ProductModule } from '../../../shared/authorization/constants';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PRODUCT_LABELS } from '../tickets/ticket-grouping';
import { AI_LEAD_PRODUCT_UNKNOWN } from '../ai-research/ai-research.config';
import { leadContact, leadProducts } from '../ai-research/lead-fields';
import { SaasPricingService, isProductModule } from '../../saas-pricing/saas-pricing.service';
import { SalesAiService, aiCallPrep, classifyReplyHeuristic } from './sales-ai.service';
import { SalesConsentService } from './sales-consent.service';
import { productFacts } from './sales-template-library';
import { formatPrice, htmlToText } from './sales-templates';
import { LeadScore, nextBusinessSlot, scoreLead } from './sales-scoring';
import { PlatformSalesService } from './sales.service';
import { SalesChannel, SalesReplyIntent } from './sales.config';

type Doc = Record<string, any>;
const DAY_MS = 86_400_000;

/** Huni aşamasına göre 30 gün içinde kazanılma olasılığı (tahmin ekranı). */
const STAGE_PROBABILITY: Record<string, number> = { new: 0.02, contacted: 0.06, replied: 0.2, demo: 0.4 };
/** Skor çarpanı: sıcak lead'ler aşamanın ortalamasından daha olası. */
const TEMPERATURE_FACTOR: Record<string, number> = { hot: 1.5, warm: 1, cold: 0.5 };

const POSITIVE_INTENTS = new Set<SalesReplyIntent>(['interested', 'price_question', 'demo_request', 'question']);

function productLabel(p: string | null | undefined): string | null {
  return p ? (PRODUCT_LABELS[p as ProductModule] ?? p) : null;
}

/** AI'ya verilen lead özeti (kişisel veri: sadece işletme bilgisi ve yetkili adı). */
export function leadSummary(d: Doc): string {
  const c = leadContact(d);
  const lines = [
    `Ad: ${d.name ?? '-'}${d.category ? ` (${d.category})` : ''}`,
    `Konum: ${[d.district, d.cityName ?? d.city].filter(Boolean).join(', ') || '-'}`,
  ];
  if (c.contactName) lines.push(`Yetkili: ${c.contactName}`);
  if (d.rating) lines.push(`Google puanı: ${d.rating} (${d.reviewCount ?? 0} yorum)`);
  if (d.website) lines.push(`Web sitesi: ${d.website}${d.enrichment?.siteStatus ? ` (${d.enrichment.siteStatus})` : ''}`);
  else lines.push('Web sitesi yok');
  const sig = d.enrichment?.signals;
  if (sig) {
    const has = Object.entries({ 'online üyelik': sig.onlineMembership, 'online randevu': sig.booking, 'fiyat sayfası': sig.pricing, 'ders programı': sig.classSchedule, WhatsApp: sig.whatsapp })
      .filter(([, v]) => v)
      .map(([k]) => k);
    lines.push(`Sitede olanlar: ${has.length ? has.join(', ') : 'yok'}`);
    if (sig.gymSoftware?.length) lines.push(`Kullandığı yazılım: ${sig.gymSoftware.join(', ')}`);
  }
  if (d.enrichment?.competitors?.length) lines.push(`Rakip yazılım: ${d.enrichment.competitors.join(', ')}`);
  if (d.insight) lines.push(`Segment: ${d.insight.segment ?? '-'}, büyüklük: ${d.insight.size ?? '-'}, öncelik: ${d.insight.priority ?? '-'}`);
  const s = d.strategy;
  if (s) {
    if (s.summary) lines.push(`Analiz: ${s.summary}`);
    if (s.painPoints?.length) lines.push(`Olası sorunlar: ${s.painPoints.slice(0, 4).join('; ')}`);
    if (s.angle) lines.push(`Önerilen yaklaşım: ${s.angle}`);
  }
  const bad = (Array.isArray(d.reviews) ? d.reviews : []).filter((r: Doc) => r.rating <= 3).slice(0, 2);
  for (const r of bad) lines.push(`Düşük puanlı yorum: "${String(r.text ?? '').slice(0, 160)}"`);
  lines.push(`Satış aşaması: ${d.pipeline?.status ?? 'new'}`);
  return lines.join('\n');
}

@Injectable()
export class SalesAssistantService {
  private readonly logger = new Logger(SalesAssistantService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly sales: PlatformSalesService,
    private readonly ai: SalesAiService,
    private readonly consent: SalesConsentService,
    private readonly audit: PlatformAuditService,
    @Optional() private readonly pricing?: SaasPricingService,
  ) {}

  private leads() {
    return this.firebase.db.collection(ROOT_COLLECTION.aiLeads);
  }

  private offers() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesOffers);
  }

  private activities() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesActivities);
  }

  private enrollments() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesEnrollments);
  }

  private async lead(id: string): Promise<Doc> {
    const snap = await this.leads().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    return { ...(snap.data() as Doc), id: snap.id };
  }

  /** Başlangıç paketinin aylık güncel fiyatı (yoksa null). */
  async livePrice(product: string | null | undefined): Promise<number | null> {
    if (!this.pricing) return null;
    const v = await this.pricing.price('starter', 'monthly', isProductModule(product) ? product : null).catch(() => undefined);
    return typeof v === 'number' && v > 0 ? v : null;
  }

  status() {
    return { aiConfigured: this.ai.configured(), model: this.ai.configured() ? this.ai.model() : null };
  }

  // ---------------------------------------------------------------- bugün / skor

  /** Bugün yapılacaklar: aksiyonu bugün olan lead'ler, skora göre. */
  async today(filter: { product?: string; limit?: number }) {
    const limit = Math.min(Math.max(filter.limit ?? 30, 1), 100);
    const snap = await this.leads()
      .orderBy('lastSeenAt', 'desc')
      .limit(2000)
      .select('name', 'district', 'city', 'phone', 'website', 'email', 'emails', 'enrichment.email', 'enrichment.emails', 'insight', 'pipeline', 'reviewCount', 'rating', 'category')
      .get();
    const now = Date.now();
    // İstanbul saatiyle bugünün sonu (UTC+3). Mesai dışındaysa bir sonraki iş gününün sonu.
    const slot = Date.parse(nextBusinessSlot(now));
    const local = new Date(slot + 3 * 3600_000);
    local.setUTCHours(23, 59, 59, 0);
    const endOfDay = local.getTime() - 3 * 3600_000;
    const counts = { hot: 0, warm: 0, cold: 0 };
    const items: (ReturnType<typeof this.toTodayItem> & { _due: number })[] = [];
    for (const doc of snap.docs) {
      const d = { ...doc.data(), id: doc.id } as Doc;
      const { products } = leadProducts(d);
      if (filter.product && !(filter.product === AI_LEAD_PRODUCT_UNKNOWN ? !products.length : products.includes(filter.product))) continue;
      const score = scoreLead(d, now);
      if (!score.nextAction) continue;
      counts[score.temperature] += 1;
      if (score.nextAction.type === 'wait') continue;
      const due = Date.parse(score.nextAction.dueAt);
      if (due > endOfDay) continue;
      items.push({ ...this.toTodayItem(d, score, products), _due: due });
    }
    items.sort((a, b) => b.score - a.score || a._due - b._due);
    return {
      generatedAt: new Date(now).toISOString(),
      counts,
      total: items.length,
      items: items.slice(0, limit).map(({ _due, ...rest }) => rest),
    };
  }

  private toTodayItem(d: Doc, s: LeadScore, products: string[]) {
    const c = leadContact(d);
    return {
      leadId: d.id as string,
      name: (d.name ?? null) as string | null,
      district: (d.district ?? null) as string | null,
      products,
      status: (d.pipeline?.status ?? 'new') as string,
      score: s.score,
      temperature: s.temperature,
      factors: s.factors,
      nextAction: s.nextAction!,
      phone: (d.phone ?? null) as string | null,
      email: c.email,
      mobile: c.mobile,
      lastContactAt: (d.pipeline?.lastContactAt ?? null) as string | null,
    };
  }

  async score(leadId: string) {
    const d = await this.lead(leadId);
    return scoreLead(d);
  }

  // ---------------------------------------------------------------- AI mesaj

  /** Lead'e özel mesaj taslağı. Gönderim panelde onaylanınca normal teklif akışıyla yapılır. */
  async compose(dto: { leadId: string; channel: SalesChannel; kind?: string; templateId?: string; product?: string; instructions?: string }, admin: PlatformAdminUser) {
    const d = await this.lead(dto.leadId);
    const product = dto.product || leadProducts(d).products[0] || null;
    const kind = dto.kind ?? 'offer';
    let base: { subject: string | null; body: string } | null = null;
    if (dto.templateId) {
      const t = await this.sales.resolveContent({ templateId: dto.templateId }, dto.channel);
      base = { subject: t.subject || null, body: t.bodyFormat === 'html' ? htmlToText(t.body) : t.body };
    }
    const amount = await this.livePrice(product);
    const price = amount ? { amount, currency: 'TRY', period: 'monthly' as const } : null;
    const history = await this.historyText(d.id);
    const out = await this.ai.compose({
      channel: dto.channel,
      kind,
      leadSummary: leadSummary(d),
      productFacts: productFacts(product),
      priceText: price ? formatPrice(price) : null,
      history,
      baseTemplate: base,
      instructions: dto.instructions?.trim() || null,
    });
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'SALES_AI_COMPOSED',
      targetType: 'sales',
      targetId: d.id,
      after: { channel: dto.channel, kind, product, model: this.ai.model() },
    });
    return { ...out, channel: dto.channel, kind, product, productLabel: productLabel(product), price, model: this.ai.model() };
  }

  /** Arama öncesi hazırlık: açılış, sorular, itirazlar ve cevapları. Kaydedilmez, her açılışta yeniden üretilir. */
  async callPrep(dto: { leadId: string; product?: string; instructions?: string }, admin: PlatformAdminUser) {
    const d = await this.lead(dto.leadId);
    const product = dto.product || leadProducts(d).products[0] || null;
    const amount = await this.livePrice(product);
    const price = amount ? { amount, currency: 'TRY', period: 'monthly' as const } : null;
    const s = scoreLead(d);
    const out = await aiCallPrep(this.ai, {
      leadSummary: leadSummary(d),
      productLabel: productLabel(product),
      productFacts: productFacts(product),
      priceText: price ? formatPrice(price) : null,
      history: await this.historyText(d.id),
      scoreFactors: s.factors,
      instructions: dto.instructions?.trim() || null,
    });
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'SALES_AI_CALL_PREP',
      targetType: 'sales',
      targetId: d.id,
      after: { product, model: this.ai.model() },
    });
    const c = leadContact(d);
    return {
      ...out,
      leadId: d.id,
      leadName: d.name ?? null,
      contactName: c.contactName ?? null,
      phone: c.mobile ?? d.phone ?? null,
      product,
      productLabel: productLabel(product),
      price,
      score: s.score,
      temperature: s.temperature,
      model: this.ai.model(),
    };
  }

  private async historyText(leadId: string): Promise<string | null> {
    const [offers, acts] = await Promise.all([
      this.offers().where('leadId', '==', leadId).get(),
      this.activities().where('leadId', '==', leadId).get(),
    ]);
    const rows = [
      ...offers.docs.map((o) => o.data()).filter((o) => o.status !== 'failed').map((o) => ({ at: o.createdAt as string, text: `Biz (${o.channel}, ${o.kind}): ${String(o.body ?? '').slice(0, 300)}` })),
      ...acts.docs
        .map((a) => a.data())
        .filter((a) => a.type !== 'followup')
        .map((a) => ({ at: a.createdAt as string, text: a.type === 'reply' ? `Müşteri (${a.channel ?? '-'}): ${String(a.text).slice(0, 300)}` : `Not (${a.type}): ${String(a.text).slice(0, 200)}` })),
    ]
      .sort((a, b) => a.at.localeCompare(b.at))
      .slice(-6);
    return rows.length ? rows.map((r) => `- ${r.at.slice(0, 10)} ${r.text}`).join('\n') : null;
  }

  // ---------------------------------------------------------------- gelen cevap

  /**
   * Lead'den gelen cevabı kaydeder: AI niyeti sınıflandırır, huni aşaması ilerler, cevap taslağı
   * döner; "listeden çıkarın" ise ret listesine eklenir. Otomatik takip dizileri durur.
   */
  async logReply(dto: { leadId: string; channel: SalesChannel | 'call' | 'other'; text: string; offerId?: string }, admin: PlatformAdminUser) {
    const d = await this.lead(dto.leadId);
    const offersSnap = await this.offers().where('leadId', '==', d.id).get();
    const lastOffer = offersSnap.docs
      .map((o) => o.data())
      .filter((o) => o.status !== 'failed')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

    let aiUsed = false;
    let analysis: { intent: SalesReplyIntent; sentiment: string; summary: string; suggestedReply: string; followUpInDays: number };
    if (this.ai.configured()) {
      try {
        analysis = await this.ai.classifyReply({ text: dto.text, leadSummary: leadSummary(d), lastMessage: lastOffer?.body ?? null });
        aiUsed = true;
      } catch (error) {
        this.logger.warn(`Reply classification failed: ${(error as Error).message}`);
        analysis = heuristicAnalysis(dto.text);
      }
    } else {
      analysis = heuristicAnalysis(dto.text);
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const status = d.pipeline?.status ?? 'new';
    const batch = this.firebase.db.batch();
    const actRef = this.activities().doc();
    const product = leadProducts(d).products[0] ?? null;
    const activity = {
      ...createBaseFields(actRef.id, admin.uid, nowIso),
      leadId: d.id,
      leadName: d.name ?? null,
      product,
      type: 'reply',
      channel: dto.channel,
      text: dto.text.trim(),
      intent: analysis.intent,
      sentiment: analysis.sentiment,
      summary: analysis.summary,
      suggestedReply: analysis.suggestedReply,
      aiUsed,
      dueAt: null,
      done: true,
      doneAt: nowIso,
      offerId: dto.offerId ?? lastOffer?.id ?? null,
      createdByEmail: admin.email,
    };
    batch.set(actRef, activity);

    const leadPatch: Doc = {
      'pipeline.lastReplyAt': nowIso,
      'pipeline.lastReplyIntent': analysis.intent,
      'pipeline.lastContactAt': nowIso,
      'pipeline.updatedAt': nowIso,
      'pipeline.updatedBy': admin.uid,
      'pipeline.updatedByEmail': admin.email,
    };
    if (POSITIVE_INTENTS.has(analysis.intent) && (status === 'new' || status === 'contacted')) leadPatch['pipeline.status'] = 'replied';
    if (analysis.intent === 'not_interested' && !['won', 'lost'].includes(status)) {
      leadPatch['pipeline.status'] = 'lost';
      leadPatch['pipeline.lostReason'] = analysis.summary || 'İlgilenmiyor';
    }
    let followUp: string | null = null;
    if (analysis.intent === 'demo_request') followUp = nextBusinessSlot(now.getTime());
    else if (analysis.intent !== 'unsubscribe' && analysis.intent !== 'not_interested' && analysis.followUpInDays > 0) {
      followUp = nextBusinessSlot(now.getTime() + analysis.followUpInDays * DAY_MS);
    }
    if (followUp) {
      const fRef = this.activities().doc();
      batch.set(fRef, {
        ...createBaseFields(fRef.id, admin.uid, nowIso),
        leadId: d.id,
        leadName: d.name ?? null,
        product,
        type: 'followup',
        text: analysis.intent === 'demo_request' ? 'Demo ayarlayın (müşteri istedi)' : `Cevap takibi: ${analysis.summary || 'tekrar iletişime geçin'}`,
        dueAt: followUp,
        done: false,
        doneAt: null,
        offerId: activity.offerId,
        createdByEmail: admin.email,
      });
      leadPatch['pipeline.nextFollowUpAt'] = followUp;
    }
    if (analysis.intent === 'unsubscribe') {
      leadPatch['pipeline.optedOut'] = { at: nowIso, reason: 'reply', byEmail: admin.email };
      leadPatch['pipeline.status'] = 'ignored';
      leadPatch['pipeline.nextFollowUpAt'] = null;
    }
    batch.update(this.leads().doc(d.id), leadPatch);
    if (lastOffer && lastOffer.status === 'sent' && analysis.intent === 'not_interested') {
      batch.update(this.offers().doc(lastOffer.id), { status: 'rejected', response: { status: 'rejected', at: nowIso, byEmail: admin.email, note: analysis.summary } });
    }
    await batch.commit();

    if (analysis.intent === 'unsubscribe') await this.optOutLead(d, 'reply', admin);
    const stopped = await this.stopEnrollments(d.id, `Cevap geldi (${analysis.intent})`);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'SALES_REPLY_LOGGED',
      targetType: 'sales',
      targetId: d.id,
      after: { intent: analysis.intent, aiUsed, stoppedSequences: stopped },
    });
    return { activity, analysis, aiUsed, followUpAt: followUp, stoppedSequences: stopped };
  }

  /** Lead'in e-posta ve cep numarasını ret listesine ekler. */
  async optOutLead(d: Doc, reason: 'reply' | 'unsubscribe' | 'manual', by: { uid: string; email: string | null } | null) {
    const c = leadContact(d);
    for (const v of [c.email, c.mobile, d.phone].filter(Boolean) as string[]) {
      if (!SalesConsentService.key(v)) continue;
      await this.consent.add({ value: v, reason, leadId: d.id, leadName: d.name ?? null, source: reason === 'unsubscribe' ? 'link' : 'panel' }, by);
    }
  }

  /** Lead'in aktif dizi kayıtlarını durdurur. */
  async stopEnrollments(leadId: string, reason: string): Promise<number> {
    const snap = await this.enrollments().where('leadId', '==', leadId).get();
    const active = snap.docs.filter((e) => e.data().status === 'active');
    if (!active.length) return 0;
    const batch = this.firebase.db.batch();
    const now = new Date().toISOString();
    for (const e of active) batch.update(e.ref, { status: 'stopped', stopReason: reason, nextRunAt: null, updatedAt: now });
    await batch.commit();
    return active.length;
  }

  // ---------------------------------------------------------------- reklam

  async adCopy(dto: { product: string; platform: 'meta' | 'google'; goal?: string; district?: string; instructions?: string }, admin: PlatformAdminUser) {
    const snap = await this.leads().orderBy('lastSeenAt', 'desc').limit(2000).select('district', 'city', 'insight', 'pipeline', 'strategy', 'rating', 'website', 'enrichment.competitors').get();
    const leads = snap.docs.map((x) => x.data()).filter((d) => leadProducts(d).products.includes(dto.product));
    const inArea = dto.district ? leads.filter((d) => d.district === dto.district) : leads;
    const byDistrict = countBy(inArea.map((d) => d.district).filter(Boolean)).slice(0, 8);
    const segments = countBy(inArea.map((d) => d.insight?.segment).filter(Boolean)).slice(0, 5);
    const pains = countBy(inArea.flatMap((d) => (Array.isArray(d.strategy?.painPoints) ? d.strategy.painPoints : []))).slice(0, 8);
    const competitors = countBy(inArea.flatMap((d) => d.enrichment?.competitors ?? [])).slice(0, 5);
    const noSite = inArea.filter((d) => !d.website).length;
    const stats = [
      `Bu üründe ${inArea.length} potansiyel müşteri (toplam ${leads.length}).`,
      byDistrict.length ? `İlçelere göre: ${byDistrict.map(([k, v]) => `${k} ${v}`).join(', ')}` : '',
      segments.length ? `Segmentler: ${segments.map(([k, v]) => `${k} ${v}`).join(', ')}` : '',
      inArea.length ? `Web sitesi olmayan: %${Math.round((noSite / inArea.length) * 100)}` : '',
      competitors.length ? `Kullanılan rakip yazılımlar: ${competitors.map(([k, v]) => `${k} ${v}`).join(', ')}` : '',
      pains.length ? `Sık görülen sorunlar: ${pains.map(([k]) => k).join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const amount = await this.livePrice(dto.product);
    const out = await this.ai.adCopy({
      productLabel: productLabel(dto.product) ?? dto.product,
      productFacts: productFacts(dto.product),
      platform: dto.platform,
      goal: dto.goal?.trim() || 'demo talebi toplamak',
      area: dto.district ? `${dto.district}, Antalya` : 'Antalya',
      stats,
      priceText: amount ? formatPrice({ amount, currency: 'TRY', period: 'monthly' }) : null,
      instructions: dto.instructions?.trim() || null,
    });
    await this.audit.record({ adminUid: admin.uid, adminEmail: admin.email, action: 'SALES_AI_AD_COPY', targetType: 'sales', targetId: dto.product, after: { platform: dto.platform } });
    return { ...out, product: dto.product, platform: dto.platform, leadCount: inArea.length, stats, model: this.ai.model() };
  }

  // ---------------------------------------------------------------- tahmin

  /** Huni ve skorlardan 30 günlük yeni abone ve aylık gelir (MRR) tahmini; son 90 günün gerçekleşeni. */
  async forecast(filter: { product?: string }) {
    const snap = await this.leads()
      .orderBy('lastSeenAt', 'desc')
      .limit(2000)
      .select('name', 'phone', 'email', 'emails', 'insight', 'pipeline', 'reviewCount')
      .get();
    const now = Date.now();
    const since90 = new Date(now - 90 * DAY_MS).toISOString();
    const prices = new Map<string, number | null>();
    const priceOf = async (p: string) => {
      if (!prices.has(p)) prices.set(p, await this.livePrice(p === AI_LEAD_PRODUCT_UNKNOWN ? null : p));
      return prices.get(p) ?? null;
    };
    type Row = { product: string; openLeads: number; expectedCustomers: number; expectedMrr: number; won90: number; wonMrr90: number; price: number | null };
    const rows = new Map<string, Row>();
    const byStage: Record<string, { leads: number; expected: number }> = {};
    for (const doc of snap.docs) {
      const d = doc.data();
      const product = leadProducts(d).products[0] ?? AI_LEAD_PRODUCT_UNKNOWN;
      if (filter.product && product !== filter.product) continue;
      const status = d.pipeline?.status ?? 'new';
      const row = rows.get(product) ?? { product, openLeads: 0, expectedCustomers: 0, expectedMrr: 0, won90: 0, wonMrr90: 0, price: null };
      rows.set(product, row);
      const price = await priceOf(product);
      row.price = price;
      if (status === 'won') {
        const wonAt = d.pipeline?.wonAt ?? d.pipeline?.updatedAt;
        if (wonAt && wonAt >= since90) {
          row.won90 += 1;
          row.wonMrr90 += price ?? 0;
        }
        continue;
      }
      const base = STAGE_PROBABILITY[status];
      if (base === undefined || d.pipeline?.optedOut) continue;
      const s = scoreLead(d, now);
      const p = Math.min(0.9, base * TEMPERATURE_FACTOR[s.temperature]);
      row.openLeads += 1;
      row.expectedCustomers += p;
      row.expectedMrr += p * (price ?? 0);
      byStage[status] = byStage[status] ?? { leads: 0, expected: 0 };
      byStage[status].leads += 1;
      byStage[status].expected += p;
    }
    const list = [...rows.values()]
      .map((r) => ({
        ...r,
        productLabel: r.product === AI_LEAD_PRODUCT_UNKNOWN ? 'Ürün atanmamış' : productLabel(r.product),
        expectedCustomers: round1(r.expectedCustomers),
        expectedMrr: Math.round(r.expectedMrr),
      }))
      .sort((a, b) => b.expectedMrr - a.expectedMrr || b.openLeads - a.openLeads);
    return {
      horizonDays: 30,
      expectedCustomers: round1(list.reduce((a, r) => a + r.expectedCustomers, 0)),
      expectedMrr: list.reduce((a, r) => a + r.expectedMrr, 0),
      won90: list.reduce((a, r) => a + r.won90, 0),
      wonMrr90: list.reduce((a, r) => a + r.wonMrr90, 0),
      byProduct: list,
      byStage: Object.fromEntries(Object.entries(byStage).map(([k, v]) => [k, { leads: v.leads, expected: round1(v.expected) }])),
      probabilities: STAGE_PROBABILITY,
      note: 'Tahmin; huni aşaması ve lead skoruna göre. Fiyat: Abonelik Fiyatları\'ndaki başlangıç paketi (aylık).',
    };
  }

  // ---------------------------------------------------------------- herkese açık bağlantılar

  private async offerByToken(token: string): Promise<{ ref: FirebaseFirestore.DocumentReference; offer: Doc } | null> {
    if (!/^[A-Za-z0-9_-]{10,40}$/.test(token)) return null;
    const snap = await this.offers().where('publicToken', '==', token).limit(1).get();
    const doc = snap.docs[0];
    return doc ? { ref: doc.ref, offer: doc.data() } : null;
  }

  async recordOpen(token: string): Promise<void> {
    const found = await this.offerByToken(token);
    if (!found) return;
    const now = new Date().toISOString();
    await found.ref.update({ openCount: FieldValue.increment(1), openedAt: found.offer.openedAt ?? now, lastOpenAt: now });
    await this.leads().doc(found.offer.leadId).update({ 'pipeline.lastOpenAt': now }).catch(() => undefined);
  }

  /** Tıklanan bağlantının asıl adresi; bulunamazsa odivon.com. */
  async recordClick(token: string, index: number): Promise<string> {
    const found = await this.offerByToken(token);
    const url = found?.offer.links?.[index];
    if (!found || typeof url !== 'string' || !/^https?:\/\//.test(url)) return 'https://odivon.com';
    const now = new Date().toISOString();
    await found.ref.update({
      clickCount: FieldValue.increment(1),
      clickedAt: found.offer.clickedAt ?? now,
      lastClickAt: now,
      openedAt: found.offer.openedAt ?? now,
    });
    await this.leads().doc(found.offer.leadId).update({ 'pipeline.lastClickAt': now, 'pipeline.lastOpenAt': now }).catch(() => undefined);
    return url;
  }

  async unsubscribe(token: string): Promise<{ ok: boolean; leadName: string | null }> {
    const found = await this.offerByToken(token);
    if (!found) return { ok: false, leadName: null };
    const { offer } = found;
    const now = new Date().toISOString();
    if (offer.to) await this.consent.add({ value: offer.to, reason: 'unsubscribe', leadId: offer.leadId, leadName: offer.leadName, source: 'link' }, null);
    const leadSnap = await this.leads().doc(offer.leadId).get();
    if (leadSnap.exists) {
      const d = { ...(leadSnap.data() as Doc), id: leadSnap.id };
      await this.optOutLead(d, 'unsubscribe', null);
      await leadSnap.ref.update({ 'pipeline.optedOut': { at: now, reason: 'unsubscribe', byEmail: null }, 'pipeline.nextFollowUpAt': null });
    }
    await this.stopEnrollments(offer.leadId, 'Abonelikten çıktı');
    return { ok: true, leadName: offer.leadName ?? null };
  }

  async demoContext(token: string) {
    const found = await this.offerByToken(token);
    if (!found) return null;
    return { leadName: (found.offer.leadName ?? null) as string | null, productLabel: (found.offer.productLabel ?? null) as string | null };
  }

  /** Teklifteki demo bağlantısından gelen talep: takip görevi, lead "demo" aşaması. */
  async requestDemo(token: string, form: { name?: string; phone?: string; when?: string; note?: string }) {
    const found = await this.offerByToken(token);
    if (!found) return { ok: false };
    const { offer } = found;
    const now = new Date();
    const nowIso = now.toISOString();
    const leadRef = this.leads().doc(offer.leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) return { ok: false };
    const d = leadSnap.data() as Doc;
    const clean = (v: string | undefined, n: number) => (v ?? '').replace(/[<>]/g, '').trim().slice(0, n);
    const name = clean(form.name, 80);
    const phone = clean(form.phone, 30);
    const when = clean(form.when, 80);
    const note = clean(form.note, 500);
    const due = nextBusinessSlot(now.getTime());
    const batch = this.firebase.db.batch();
    const ref = this.activities().doc();
    batch.set(ref, {
      ...createBaseFields(ref.id, 'public', nowIso),
      leadId: offer.leadId,
      leadName: d.name ?? null,
      product: offer.product ?? null,
      type: 'demo',
      text: `Demo talebi (bağlantıdan): ${[name && `Ad: ${name}`, phone && `Tel: ${phone}`, when && `Uygun zaman: ${when}`, note && `Not: ${note}`].filter(Boolean).join(' · ') || 'detay yok'}`,
      dueAt: due,
      done: false,
      doneAt: null,
      offerId: offer.id,
      createdByEmail: null,
    });
    const patch: Doc = {
      'pipeline.demoRequestedAt': nowIso,
      'pipeline.nextFollowUpAt': due,
      'pipeline.lastReplyAt': nowIso,
      'pipeline.updatedAt': nowIso,
    };
    if (['new', 'contacted', 'replied'].includes(d.pipeline?.status ?? 'new')) patch['pipeline.status'] = 'demo';
    if (name && !d.pipeline?.contact?.contactName) patch['pipeline.contact.contactName'] = name;
    if (phone && !d.pipeline?.contact?.whatsapp) patch['pipeline.contact.whatsapp'] = phone;
    batch.update(leadRef, patch);
    batch.update(found.ref, { demoRequestedAt: nowIso });
    await batch.commit();
    await this.stopEnrollments(offer.leadId, 'Demo talep etti');
    return { ok: true };
  }
}

function heuristicAnalysis(text: string) {
  const intent = classifyReplyHeuristic(text);
  return {
    intent,
    sentiment: POSITIVE_INTENTS.has(intent) ? 'positive' : intent === 'not_interested' || intent === 'unsubscribe' ? 'negative' : 'neutral',
    summary: text.trim().slice(0, 140),
    suggestedReply: '',
    followUpInDays: intent === 'later' ? 30 : POSITIVE_INTENTS.has(intent) ? 1 : 0,
  };
}

function countBy(values: string[]): [string, number][] {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

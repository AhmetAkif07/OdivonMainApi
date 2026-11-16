import { Injectable, Logger } from '@nestjs/common';
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
import { AI_LEAD_PIPELINE_STATUSES, AI_LEAD_PRODUCT_UNKNOWN } from '../ai-research/ai-research.config';
import { leadContact, leadProducts } from '../ai-research/lead-fields';
import { SalesChannelsService, WhatsappTemplateRef } from './sales-channels.service';
import { SALES_PLACEHOLDERS, SalesTemplateVars, manualLink, renderSalesEmail, renderSalesText } from './sales-templates';
import {
  CreateSalesActivityDto,
  CreateSalesTemplateDto,
  PreviewSalesOfferDto,
  SendSalesOffersDto,
  UpdateSalesActivityDto,
  UpdateSalesOfferDto,
  UpdateSalesTemplateDto,
} from './dto';
import {
  SALES_ACTIVITY_TYPES,
  SALES_CHANNELS,
  SALES_OFFER_KINDS,
  SALES_OFFER_STATUSES,
  SALES_SEND_STEP_SIZE,
  SalesChannel,
  SalesDeliveryMode,
  SalesOfferKind,
} from './sales.config';

type Doc = Record<string, any>;

export interface SalesOfferFilters {
  leadId?: string;
  status?: string;
  channel?: string;
  kind?: string;
  product?: string;
  batchId?: string;
  q?: string;
}

export interface SalesActivityFilters {
  leadId?: string;
  type?: string;
  /** open = yapılmamış takipler, overdue = süresi geçmiş, upcoming = önümüzdeki 7 gün, done = tamamlanan. */
  due?: 'open' | 'overdue' | 'upcoming' | 'done';
}

export interface SalesSendResultItem {
  leadId: string;
  leadName: string | null;
  ok: boolean;
  offerId: string | null;
  deliveryMode: SalesDeliveryMode | null;
  to: string | null;
  /** manual modda yöneticinin açacağı wa.me / sms: bağlantısı. */
  link: string | null;
  error: string | null;
}

/** Şablon + istekten gelen içerik birleştirilmiş hâli. */
interface ResolvedContent {
  kind: SalesOfferKind;
  product: string | null;
  subject: string;
  body: string;
  ctaUrl: string | null;
  ctaLabel: string | null;
  price: SalesTemplateVars['price'];
  validUntil: string | null;
  whatsappTemplate: { name: string; language: string; params: string[] } | null;
  templateId: string | null;
  templateName: string | null;
}

const DAY_MS = 86_400_000;

function productLabel(product: string | null): string | null {
  return product ? (PRODUCT_LABELS[product as ProductModule] ?? product) : null;
}

function varsFor(lead: Doc, content: ResolvedContent): SalesTemplateVars {
  const contact = leadContact(lead);
  return {
    leadName: lead.name ?? null,
    contactName: contact.contactName,
    district: lead.district ?? null,
    city: lead.cityName ?? lead.city ?? null,
    productLabel: productLabel(content.product),
    price: content.price ?? null,
    validUntil: content.validUntil,
    website: lead.website ?? null,
    phone: lead.phone ?? null,
  };
}

function maskTo(channel: SalesChannel, to: string | null): string | null {
  if (!to) return null;
  if (channel === 'email') return to;
  return to.length > 6 ? `${to.slice(0, 5)}*****${to.slice(-2)}` : to;
}

@Injectable()
export class PlatformSalesService {
  private readonly logger = new Logger(PlatformSalesService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly channels: SalesChannelsService,
    private readonly audit: PlatformAuditService,
  ) {}

  private templates() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesTemplates);
  }

  private offers() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesOffers);
  }

  private activities() {
    return this.firebase.db.collection(ROOT_COLLECTION.salesActivities);
  }

  private leads() {
    return this.firebase.db.collection(ROOT_COLLECTION.aiLeads);
  }

  // ---------------------------------------------------------------- config / overview

  config() {
    return {
      channels: this.channels.status(),
      channelKeys: SALES_CHANNELS,
      kinds: SALES_OFFER_KINDS,
      offerStatuses: SALES_OFFER_STATUSES,
      activityTypes: SALES_ACTIVITY_TYPES,
      placeholders: SALES_PLACEHOLDERS,
      stepSize: SALES_SEND_STEP_SIZE,
    };
  }

  /** Satış panosu: teklif/kanal/ürün kırılımları, huni ve bekleyen takipler. */
  async overview(filter: { product?: string; days?: number }) {
    const days = Math.min(Math.max(filter.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * DAY_MS).toISOString();
    const [offerSnap, openSnap, leadSnap] = await Promise.all([
      this.offers().where('createdAt', '>=', since).get(),
      this.activities().where('done', '==', false).get(),
      this.leads().orderBy('lastSeenAt', 'desc').limit(2000).select('pipeline', 'insight', 'name').get(),
    ]);

    const matchesProduct = (p: string | null | undefined) =>
      !filter.product ||
      (filter.product === AI_LEAD_PRODUCT_UNKNOWN ? !p : p === filter.product);

    const offers = offerSnap.docs.map((d) => d.data()).filter((o) => matchesProduct(o.product));
    const byStatus: Record<string, number> = {};
    const byChannel: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    const byProduct: Record<string, number> = {};
    const leadsReached = new Set<string>();
    for (const o of offers) {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
      byChannel[o.channel] = (byChannel[o.channel] ?? 0) + 1;
      byKind[o.kind] = (byKind[o.kind] ?? 0) + 1;
      const pk = o.product ?? AI_LEAD_PRODUCT_UNKNOWN;
      byProduct[pk] = (byProduct[pk] ?? 0) + 1;
      if (o.status !== 'failed') leadsReached.add(o.leadId);
    }
    const delivered = offers.length - (byStatus.failed ?? 0);
    const accepted = byStatus.accepted ?? 0;

    const funnel: Record<string, number> = Object.fromEntries(AI_LEAD_PIPELINE_STATUSES.map((s) => [s, 0]));
    const leadProductsCount: Record<string, number> = {};
    for (const doc of leadSnap.docs) {
      const d = doc.data();
      const { products } = leadProducts(d);
      if (filter.product && !(filter.product === AI_LEAD_PRODUCT_UNKNOWN ? !products.length : products.includes(filter.product))) {
        continue;
      }
      const s = d.pipeline?.status ?? 'new';
      funnel[s] = (funnel[s] ?? 0) + 1;
      for (const p of products.length ? products : [AI_LEAD_PRODUCT_UNKNOWN]) {
        leadProductsCount[p] = (leadProductsCount[p] ?? 0) + 1;
      }
    }

    const now = Date.now();
    const open = openSnap.docs
      .map((d) => d.data())
      .filter((a) => a.dueAt)
      .filter((a) => matchesProduct(a.product));
    const overdue = open.filter((a) => Date.parse(a.dueAt) < now);
    const upcoming = open
      .filter((a) => Date.parse(a.dueAt) >= now && Date.parse(a.dueAt) < now + 7 * DAY_MS)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    return {
      days,
      offers: {
        total: offers.length,
        delivered,
        failed: byStatus.failed ?? 0,
        accepted,
        rejected: byStatus.rejected ?? 0,
        acceptanceRate: delivered ? Math.round((accepted / delivered) * 1000) / 10 : 0,
        leadsReached: leadsReached.size,
        byStatus,
        byChannel,
        byKind,
        byProduct,
      },
      funnel,
      leadProducts: leadProductsCount,
      followUps: {
        overdue: overdue.length,
        upcoming: upcoming.length,
        next: [...overdue.sort((a, b) => a.dueAt.localeCompare(b.dueAt)), ...upcoming].slice(0, 15),
      },
      recentOffers: offers.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 10).map(stripOffer),
      channels: this.channels.status(),
    };
  }

  // ---------------------------------------------------------------- templates

  async listTemplates() {
    const snap = await this.templates().get();
    return snap.docs
      .map((d) => d.data())
      .filter((t) => !t.deletedAt)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  async createTemplate(dto: CreateSalesTemplateDto, admin: PlatformAdminUser) {
    if (dto.channel === 'email' && !dto.subject?.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'E-posta şablonunda konu zorunlu');
    }
    const ref = this.templates().doc();
    const doc = {
      ...createBaseFields(ref.id, admin.uid),
      name: dto.name.trim(),
      channel: dto.channel,
      kind: dto.kind,
      product: dto.product || null,
      subject: dto.subject?.trim() ?? '',
      body: dto.body,
      ctaUrl: dto.ctaUrl?.trim() || null,
      ctaLabel: dto.ctaLabel?.trim() || null,
      price: dto.price ?? null,
      whatsappTemplate: dto.whatsappTemplate ? normalizeWaTemplate(dto.whatsappTemplate) : null,
      active: dto.active ?? true,
      createdByEmail: admin.email,
    };
    await ref.set(doc);
    await this.record(admin, 'SALES_TEMPLATE_CREATED', ref.id, { name: doc.name, channel: doc.channel });
    return doc;
  }

  async updateTemplate(id: string, dto: UpdateSalesTemplateDto, admin: PlatformAdminUser) {
    const ref = this.templates().doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data() as Doc).deletedAt) {
      throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Şablon bulunamadı');
    }
    const patch: Doc = { updatedAt: new Date().toISOString(), updatedBy: admin.uid };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.channel !== undefined) patch.channel = dto.channel;
    if (dto.kind !== undefined) patch.kind = dto.kind;
    if (dto.product !== undefined) patch.product = dto.product || null;
    if (dto.subject !== undefined) patch.subject = dto.subject.trim();
    if (dto.body !== undefined) patch.body = dto.body;
    if (dto.ctaUrl !== undefined) patch.ctaUrl = dto.ctaUrl.trim() || null;
    if (dto.ctaLabel !== undefined) patch.ctaLabel = dto.ctaLabel.trim() || null;
    if (dto.price !== undefined) patch.price = dto.price ?? null;
    if (dto.whatsappTemplate !== undefined) {
      patch.whatsappTemplate = dto.whatsappTemplate ? normalizeWaTemplate(dto.whatsappTemplate) : null;
    }
    if (dto.active !== undefined) patch.active = dto.active;
    await ref.update(patch);
    await this.record(admin, 'SALES_TEMPLATE_UPDATED', id, { fields: Object.keys(patch) });
    return { ...(snap.data() as Doc), ...patch };
  }

  async deleteTemplate(id: string, admin: PlatformAdminUser) {
    const ref = this.templates().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Şablon bulunamadı');
    const now = new Date().toISOString();
    // Gönderilmiş teklifler şablona referans verdiği için yumuşak silme.
    await ref.update({ deletedAt: now, active: false, updatedAt: now, updatedBy: admin.uid });
    await this.record(admin, 'SALES_TEMPLATE_DELETED', id, { name: (snap.data() as Doc).name });
    return { ok: true };
  }

  // ---------------------------------------------------------------- offers

  private async resolveContent(
    dto: Pick<
      SendSalesOffersDto,
      'templateId' | 'kind' | 'product' | 'subject' | 'body' | 'ctaUrl' | 'ctaLabel' | 'price' | 'validUntil'
    >,
    channel: SalesChannel,
  ): Promise<ResolvedContent> {
    let t: Doc | null = null;
    if (dto.templateId) {
      const snap = await this.templates().doc(dto.templateId).get();
      t = snap.exists ? (snap.data() as Doc) : null;
      if (!t || t.deletedAt) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Şablon bulunamadı');
      if (t.channel !== channel) {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Şablonun kanalı seçilen kanalla aynı değil');
      }
    }
    const body = dto.body ?? t?.body ?? '';
    const subject = dto.subject ?? t?.subject ?? '';
    if (!body.trim()) throw new AppException(ErrorCode.VALIDATION_ERROR, 'Mesaj metni boş olamaz');
    if (channel === 'email' && !subject.trim()) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'E-posta konusu boş olamaz');
    }
    return {
      kind: dto.kind ?? t?.kind ?? 'offer',
      product: dto.product ?? t?.product ?? null,
      subject,
      body,
      ctaUrl: dto.ctaUrl ?? t?.ctaUrl ?? null,
      ctaLabel: dto.ctaLabel ?? t?.ctaLabel ?? null,
      price: dto.price ?? t?.price ?? null,
      validUntil: dto.validUntil ?? null,
      whatsappTemplate: channel === 'whatsapp' ? (t?.whatsappTemplate ?? null) : null,
      templateId: t?.id ?? null,
      templateName: t?.name ?? null,
    };
  }

  /** Tek lead için mesajın son hâli (gönderilmeden). */
  async preview(dto: PreviewSalesOfferDto) {
    const snap = await this.leads().doc(dto.leadId).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    const lead = snap.data() as Doc;
    const content = await this.resolveContent(dto, dto.channel);
    if (!content.product) content.product = leadProducts(lead).products[0] ?? null;
    const vars = varsFor(lead, content);
    const contact = leadContact(lead);
    const to = dto.channel === 'email' ? contact.email : contact.mobile;
    if (dto.channel === 'email') {
      const r = renderSalesEmail({ subject: content.subject, body: content.body, vars, ctaUrl: content.ctaUrl, ctaLabel: content.ctaLabel });
      return { channel: dto.channel, to, subject: r.subject, text: r.text, html: r.html };
    }
    return { channel: dto.channel, to, subject: null, text: renderSalesText(content.body, vars), html: null };
  }

  /**
   * Bir adım gönderim: en fazla 20 lead. Her lead için bir teklif kaydı (`salesOffers`) yazılır,
   * başarılı gönderimde lead'in hunisi new → contacted olur ve son temas tarihi işlenir.
   * Tüm Firestore yazıları tek batch'te (Workers alt istek sınırı).
   */
  async send(dto: SendSalesOffersDto, admin: PlatformAdminUser) {
    const channel = dto.channel;
    const content = await this.resolveContent(dto, channel);
    const ids = [...new Set(dto.leadIds)].slice(0, SALES_SEND_STEP_SIZE);
    const snaps = await this.firebase.db.getAll(...ids.map((id) => this.leads().doc(id)));

    const providerReady =
      channel === 'email'
        ? this.channels.emailConfigured()
        : channel === 'sms'
          ? this.channels.smsConfigured()
          : this.channels.whatsappConfigured();
    const requested = dto.mode ?? 'auto';
    const mode: SalesDeliveryMode =
      channel === 'email' ? 'api' : requested === 'auto' ? (providerReady ? 'api' : 'manual') : requested;
    if (mode === 'api' && !providerReady) {
      throw new AppException(
        ErrorCode.CRM_MAIL_NOT_CONFIGURED,
        channel === 'email'
          ? 'E-posta gönderimi yapılandırılmamış (HOSTINGER_MAIL_API_TOKEN)'
          : channel === 'sms'
            ? 'SMS sağlayıcısı yapılandırılmamış (SMS_PROVIDER / NETGSM_*)'
            : 'WhatsApp satış numarası yapılandırılmamış (WHATSAPP_ACCESS_TOKEN / SALES_WHATSAPP_PHONE_NUMBER_ID)',
      );
    }
    const mailbox = channel === 'email' ? await this.channels.resolveMailbox(dto.mailbox) : null;

    const now = new Date();
    const nowIso = now.toISOString();
    const batchId = dto.batchId?.trim() || null;
    const batch = this.firebase.db.batch();
    const results: SalesSendResultItem[] = [];

    for (const snap of snaps) {
      if (!snap.exists) {
        results.push({ leadId: snap.id, leadName: null, ok: false, offerId: null, deliveryMode: null, to: null, link: null, error: 'Lead bulunamadı' });
        continue;
      }
      const lead = snap.data() as Doc;
      const leadContent: ResolvedContent = {
        ...content,
        product: content.product ?? leadProducts(lead).products[0] ?? null,
      };
      const vars = varsFor(lead, leadContent);
      const contact = leadContact(lead);
      const to = channel === 'email' ? contact.email : contact.mobile;
      if (!to) {
        results.push({
          leadId: snap.id,
          leadName: lead.name ?? null,
          ok: false,
          offerId: null,
          deliveryMode: null,
          to: null,
          link: null,
          error: channel === 'email' ? 'E-posta adresi yok' : 'Cep telefonu yok (sabit hatta SMS/WhatsApp gitmez)',
        });
        continue;
      }

      let subject: string | null = null;
      let text: string;
      let html: string | null = null;
      if (channel === 'email') {
        const r = renderSalesEmail({ subject: leadContent.subject, body: leadContent.body, vars, ctaUrl: leadContent.ctaUrl, ctaLabel: leadContent.ctaLabel });
        subject = r.subject;
        text = r.text;
        html = r.html;
      } else {
        text = renderSalesText(leadContent.body, vars);
      }

      let ok = true;
      let error: string | null = null;
      let providerMessageId: string | null = null;
      let link: string | null = null;
      if (mode === 'manual') {
        link = manualLink(channel as 'whatsapp' | 'sms', to, text);
      } else {
        const r =
          channel === 'email'
            ? await this.channels.sendEmail(mailbox!.resourceId, { to, subject: subject!, html: html!, text })
            : channel === 'sms'
              ? await this.channels.sendSms(to, text)
              : await this.channels.sendWhatsapp(to, text, waTemplateFor(leadContent, vars));
        ok = r.ok;
        error = r.ok ? null : (r.error ?? 'Gönderilemedi');
        providerMessageId = r.providerMessageId ?? null;
      }

      const offerRef = this.offers().doc();
      batch.set(offerRef, {
        ...createBaseFields(offerRef.id, admin.uid, nowIso),
        leadId: snap.id,
        leadName: lead.name ?? null,
        leadDistrict: lead.district ?? null,
        product: leadContent.product,
        productLabel: productLabel(leadContent.product),
        channel,
        kind: leadContent.kind,
        templateId: leadContent.templateId,
        templateName: leadContent.templateName,
        batchId,
        to,
        toMasked: maskTo(channel, to),
        subject,
        body: text,
        price: leadContent.price ?? null,
        validUntil: leadContent.validUntil,
        deliveryMode: mode,
        provider: mode === 'manual' ? 'manual' : channel === 'email' ? 'hostinger' : channel === 'sms' ? 'sms' : 'meta-cloud',
        providerMessageId,
        mailbox: mailbox?.address ?? null,
        status: ok ? 'sent' : 'failed',
        error,
        sentAt: ok ? nowIso : null,
        response: null,
        createdByEmail: admin.email,
      });

      if (ok) {
        const status = lead.pipeline?.status ?? 'new';
        const leadPatch: Doc = {
          'pipeline.lastContactAt': nowIso,
          'pipeline.lastOfferAt': nowIso,
          'pipeline.lastOfferChannel': channel,
          'pipeline.offerCount': FieldValue.increment(1),
          'pipeline.updatedAt': nowIso,
          'pipeline.updatedBy': admin.uid,
          'pipeline.updatedByEmail': admin.email,
        };
        if (status === 'new') leadPatch['pipeline.status'] = 'contacted';
        // Teklif gönderilen ürün lead'e henüz atanmamışsa kategori olarak işlenir.
        if (leadContent.product && !Array.isArray(lead.pipeline?.products)) {
          leadPatch['pipeline.products'] = [leadContent.product];
        }
        if (dto.followUpInDays) {
          const dueAt = new Date(now.getTime() + dto.followUpInDays * DAY_MS).toISOString();
          const actRef = this.activities().doc();
          batch.set(actRef, {
            ...createBaseFields(actRef.id, admin.uid, nowIso),
            leadId: snap.id,
            leadName: lead.name ?? null,
            product: leadContent.product,
            type: 'followup',
            text: `${channelLabel(channel)} ${kindLabel(leadContent.kind).toLocaleLowerCase('tr-TR')} takibi`,
            dueAt,
            done: false,
            doneAt: null,
            offerId: offerRef.id,
            createdByEmail: admin.email,
          });
          const currentNext = lead.pipeline?.nextFollowUpAt as string | undefined;
          if (!currentNext || currentNext < nowIso || dueAt < currentNext) leadPatch['pipeline.nextFollowUpAt'] = dueAt;
        }
        batch.update(snap.ref, leadPatch);
      }
      results.push({
        leadId: snap.id,
        leadName: lead.name ?? null,
        ok,
        offerId: offerRef.id,
        deliveryMode: mode,
        to: maskTo(channel, to),
        link,
        error,
      });
    }

    await batch.commit();
    const sent = results.filter((r) => r.ok).length;
    await this.record(admin, 'SALES_OFFERS_SENT', batchId ?? results[0]?.offerId ?? 'sales', {
      channel,
      kind: content.kind,
      product: content.product,
      templateId: content.templateId,
      mode,
      sent,
      failed: results.length - sent,
    });
    return { channel, mode, sent, failed: results.length - sent, results };
  }

  async listOffers(f: SalesOfferFilters) {
    const snap = f.leadId
      ? await this.offers().where('leadId', '==', f.leadId).get()
      : f.batchId
        ? await this.offers().where('batchId', '==', f.batchId).get()
        : await this.offers().orderBy('createdAt', 'desc').limit(500).get();
    const q = f.q?.trim().toLocaleLowerCase('tr-TR');
    const items = snap.docs
      .map((d) => d.data())
      .filter((o) => !f.status || o.status === f.status)
      .filter((o) => !f.channel || o.channel === f.channel)
      .filter((o) => !f.kind || o.kind === f.kind)
      .filter((o) => !f.product || (f.product === AI_LEAD_PRODUCT_UNKNOWN ? !o.product : o.product === f.product))
      .filter((o) => !q || `${o.leadName ?? ''} ${o.subject ?? ''} ${o.templateName ?? ''}`.toLocaleLowerCase('tr-TR').includes(q))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .map(stripOffer);
    return { items, total: items.length };
  }

  async getOffer(id: string) {
    const snap = await this.offers().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Teklif bulunamadı');
    return snap.data();
  }

  /** Müşterinin yanıtı: kabul → lead "kazanıldı"; ret / süresi doldu sadece teklifte işlenir. */
  async updateOffer(id: string, dto: UpdateSalesOfferDto, admin: PlatformAdminUser) {
    const ref = this.offers().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Teklif bulunamadı');
    const offer = snap.data() as Doc;
    if (offer.status === 'failed') {
      throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Gönderilemeyen teklif güncellenemez');
    }
    const now = new Date().toISOString();
    const patch: Doc = { updatedAt: now, updatedBy: admin.uid };
    if (dto.status !== undefined) {
      patch.status = dto.status;
      patch.response = dto.status === 'sent' ? null : { status: dto.status, at: now, byEmail: admin.email, note: dto.note ?? null };
    } else if (dto.note !== undefined) {
      patch.response = { ...(offer.response ?? {}), note: dto.note };
    }
    await ref.update(patch);
    if (dto.status === 'accepted') {
      await this.leads()
        .doc(offer.leadId)
        .update({
          'pipeline.status': 'won',
          'pipeline.wonOfferId': id,
          'pipeline.updatedAt': now,
          'pipeline.updatedBy': admin.uid,
          'pipeline.updatedByEmail': admin.email,
        })
        .catch((e) => this.logger.warn(`Lead ${offer.leadId} güncellenemedi: ${(e as Error).message}`));
    }
    await this.record(admin, 'SALES_OFFER_UPDATED', id, { status: dto.status ?? offer.status, leadId: offer.leadId });
    return { ...offer, ...patch };
  }

  // ---------------------------------------------------------------- activities

  async listActivities(f: SalesActivityFilters) {
    const snap = f.leadId
      ? await this.activities().where('leadId', '==', f.leadId).get()
      : f.due === 'done'
        ? await this.activities().where('done', '==', true).get()
        : f.due
          ? await this.activities().where('done', '==', false).get()
          : await this.activities().orderBy('createdAt', 'desc').limit(500).get();
    const now = Date.now();
    const items = snap.docs
      .map((d) => d.data())
      .filter((a) => !f.type || a.type === f.type)
      .filter((a) => {
        if (!f.due) return true;
        if (f.due === 'done') return a.done;
        if (a.done) return false;
        if (f.due === 'open') return true;
        if (!a.dueAt) return false;
        const t = Date.parse(a.dueAt);
        return f.due === 'overdue' ? t < now : t >= now && t < now + 7 * DAY_MS;
      });
    items.sort((a, b) =>
      f.due && f.due !== 'done'
        ? String(a.dueAt ?? '9').localeCompare(String(b.dueAt ?? '9'))
        : String(b.createdAt).localeCompare(String(a.createdAt)),
    );
    return { items: items.slice(0, 500), total: items.length };
  }

  async createActivity(dto: CreateSalesActivityDto, admin: PlatformAdminUser) {
    if (dto.type === 'followup' && !dto.dueAt) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Hatırlatma için tarih zorunlu');
    }
    const leadRef = this.leads().doc(dto.leadId);
    const leadSnap = await leadRef.get();
    if (!leadSnap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    const lead = leadSnap.data() as Doc;
    const now = new Date().toISOString();
    const ref = this.activities().doc();
    const isTask = dto.type === 'followup' || ((dto.type === 'meeting' || dto.type === 'demo') && Boolean(dto.dueAt));
    const doc = {
      ...createBaseFields(ref.id, admin.uid, now),
      leadId: dto.leadId,
      leadName: lead.name ?? null,
      product: leadProducts(lead).products[0] ?? null,
      type: dto.type,
      text: dto.text.trim(),
      dueAt: dto.dueAt ?? null,
      // Not / arama kayıtları olmuş bir şeydir; sadece ileri tarihli işler "açık" kalır.
      done: !isTask,
      doneAt: isTask ? null : now,
      offerId: dto.offerId ?? null,
      createdByEmail: admin.email,
    };
    const batch = this.firebase.db.batch();
    batch.set(ref, doc);
    const leadPatch: Doc = { 'pipeline.updatedAt': now, 'pipeline.updatedBy': admin.uid, 'pipeline.updatedByEmail': admin.email };
    if (dto.type === 'call' || dto.type === 'meeting' || dto.type === 'demo') {
      if (!isTask) leadPatch['pipeline.lastContactAt'] = now;
      if ((lead.pipeline?.status ?? 'new') === 'new') leadPatch['pipeline.status'] = 'contacted';
    }
    if (dto.type === 'demo' && ['new', 'contacted', 'replied'].includes(lead.pipeline?.status ?? 'new')) {
      leadPatch['pipeline.status'] = 'demo';
    }
    if (isTask && dto.dueAt) {
      const current = lead.pipeline?.nextFollowUpAt as string | undefined;
      if (!current || current < now || dto.dueAt < current) leadPatch['pipeline.nextFollowUpAt'] = dto.dueAt;
    }
    batch.update(leadRef, leadPatch);
    await batch.commit();
    return doc;
  }

  async updateActivity(id: string, dto: UpdateSalesActivityDto, admin: PlatformAdminUser) {
    const ref = this.activities().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Aktivite bulunamadı');
    const act = snap.data() as Doc;
    const now = new Date().toISOString();
    const patch: Doc = { updatedAt: now, updatedBy: admin.uid };
    if (dto.text !== undefined) patch.text = dto.text.trim();
    if (dto.dueAt !== undefined) patch.dueAt = dto.dueAt;
    if (dto.done !== undefined) {
      patch.done = dto.done;
      patch.doneAt = dto.done ? now : null;
      patch.doneByEmail = dto.done ? admin.email : null;
    }
    await ref.update(patch);
    if (dto.done !== undefined || dto.dueAt !== undefined) await this.refreshNextFollowUp(act.leadId, admin);
    return { ...act, ...patch };
  }

  async deleteActivity(id: string, admin: PlatformAdminUser) {
    const ref = this.activities().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Aktivite bulunamadı');
    await ref.delete();
    await this.refreshNextFollowUp((snap.data() as Doc).leadId, admin);
    return { ok: true };
  }

  /** Lead'in en yakın açık takibini `pipeline.nextFollowUpAt`'a yazar (lead listesinde gösterilir). */
  private async refreshNextFollowUp(leadId: string, admin: PlatformAdminUser) {
    const snap = await this.activities().where('leadId', '==', leadId).get();
    const next = snap.docs
      .map((d) => d.data())
      .filter((a) => !a.done && a.dueAt)
      .map((a) => String(a.dueAt))
      .sort()[0] ?? null;
    await this.leads()
      .doc(leadId)
      .update({ 'pipeline.nextFollowUpAt': next, 'pipeline.updatedBy': admin.uid })
      .catch((e) => this.logger.warn(`Lead ${leadId} takip tarihi güncellenemedi: ${(e as Error).message}`));
  }

  /** Lead detayında gösterilen zaman çizelgesi: teklifler + aktiviteler. */
  async leadTimeline(leadId: string) {
    const [offers, acts] = await Promise.all([
      this.offers().where('leadId', '==', leadId).get(),
      this.activities().where('leadId', '==', leadId).get(),
    ]);
    const items = [
      ...offers.docs.map((d) => ({ type: 'offer' as const, at: d.data().createdAt as string, offer: stripOffer(d.data()) })),
      ...acts.docs.map((d) => ({ type: 'activity' as const, at: d.data().createdAt as string, activity: d.data() })),
    ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    return { items };
  }

  private async record(admin: PlatformAdminUser, action: string, targetId: string, after: Record<string, unknown>) {
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action,
      targetType: 'sales',
      targetId,
      after,
    });
  }
}

/** Listede HTML gövde taşınmaz. */
function stripOffer(o: Doc) {
  const { html: _html, ...rest } = o;
  return rest;
}

function normalizeWaTemplate(t: { name: string; language?: string; params?: string[] }) {
  return { name: t.name.trim(), language: t.language?.trim() || 'tr', params: t.params ?? [] };
}

function waTemplateFor(content: ResolvedContent, vars: SalesTemplateVars): WhatsappTemplateRef | null {
  const t = content.whatsappTemplate;
  if (!t?.name) return null;
  return { name: t.name, language: t.language, params: t.params.map((p) => renderSalesText(p, vars)) };
}

function channelLabel(c: SalesChannel) {
  return c === 'email' ? 'E-posta' : c === 'sms' ? 'SMS' : 'WhatsApp';
}

function kindLabel(k: SalesOfferKind) {
  return k === 'offer' ? 'Teklif' : k === 'ad' ? 'Reklam' : k === 'followup' ? 'Takip' : 'Bilgilendirme';
}

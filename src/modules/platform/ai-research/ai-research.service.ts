import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import {
  AI_LEAD_PRODUCT_UNKNOWN,
  AI_LEAD_PRODUCTS,
  AI_RESEARCH_CITIES,
  AI_RESEARCH_DEFAULT_KEYWORDS,
  AI_RUNNER_OFFLINE_AFTER_MS,
  AI_RUNNER_SETTINGS_DOC,
} from './ai-research.config';
import { BulkUpdateAiLeadProductsDto, CreateAiResearchRunDto, UpdateAiLeadDto } from './dto';
import { scoreLead } from '../sales/sales-scoring';
import { leadContact, leadProducts } from './lead-fields';
import { PRODUCT_LABELS } from '../tickets/ticket-grouping';

export interface AiLeadListFilters {
  runId?: string;
  priority?: string;
  status?: string;
  district?: string;
  segment?: string;
  competitor?: string;
  /** Ürün modülü (ör. gym) ya da `unknown` = ürün atanmamış. */
  product?: string;
  q?: string;
}

type Doc = Record<string, any>;

/** Liste ekranında gereken alanlar; strateji metinleri ve yorumlar detayda gelir. */
function toListItem(d: Doc) {
  const products = leadProducts(d);
  const contact = leadContact(d);
  const score = scoreLead(d);
  return {
    id: d.id,
    name: d.name,
    city: d.city ?? null,
    district: d.district ?? null,
    category: d.category ?? null,
    phone: d.phone ?? null,
    website: d.website ?? null,
    rating: d.rating ?? null,
    reviewCount: d.reviewCount ?? null,
    mapsUrl: d.mapsUrl ?? null,
    siteStatus: d.enrichment?.siteStatus ?? null,
    competitors: d.enrichment?.competitors ?? [],
    hasOwnApp: (d.insight?.ownApp ?? 0) >= 0.5,
    insight: d.insight
      ? {
          priority: d.insight.priority,
          odivonFit: d.insight.odivonFit,
          digitalScore: d.insight.digitalScore,
          segment: d.insight.segment,
          size: d.insight.size,
          isGym: d.insight.isGym,
        }
      : null,
    products: products.products,
    productsInferred: products.inferred,
    email: contact.email,
    mobile: contact.mobile,
    sales: {
      offerCount: d.pipeline?.offerCount ?? 0,
      lastOfferAt: d.pipeline?.lastOfferAt ?? null,
      lastContactAt: d.pipeline?.lastContactAt ?? null,
      nextFollowUpAt: d.pipeline?.nextFollowUpAt ?? null,
      score: score.score,
      temperature: score.temperature,
      nextAction: score.nextAction?.label ?? null,
      optedOut: Boolean(d.pipeline?.optedOut),
    },
    hasStrategy: Boolean(d.strategy),
    pipeline: d.pipeline ?? { status: 'new' },
    lastRunId: d.lastRunId ?? null,
    lastSeenAt: d.lastSeenAt ?? null,
  };
}

const PRIORITY_ORDER: Record<string, number> = { sicak: 0, ilik: 1, soguk: 2 };

@Injectable()
export class PlatformAiResearchService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
  ) {}

  private runs() {
    return this.firebase.db.collection(ROOT_COLLECTION.aiResearchRuns);
  }

  private leads() {
    return this.firebase.db.collection(ROOT_COLLECTION.aiLeads);
  }

  getConfig() {
    return {
      cities: Object.entries(AI_RESEARCH_CITIES).map(([key, c]) => ({ key, ...c })),
      defaultKeywords: AI_RESEARCH_DEFAULT_KEYWORDS,
      products: this.getProductCatalog(),
    };
  }

  getProductCatalog() {
    return AI_LEAD_PRODUCTS.map((key) => ({ key, label: PRODUCT_LABELS[key] ?? key }));
  }

  async getRunnerStatus() {
    const snap = await this.firebase.db
      .collection(ROOT_COLLECTION.platformSettings)
      .doc(AI_RUNNER_SETTINGS_DOC)
      .get();
    const d = snap.exists ? (snap.data() as Doc) : null;
    const lastSeenAt: string | null = d?.lastSeenAt ?? null;
    const online = Boolean(lastSeenAt && Date.now() - Date.parse(lastSeenAt) < AI_RUNNER_OFFLINE_AFTER_MS);
    return {
      online,
      lastSeenAt,
      host: d?.host ?? null,
      state: online ? (d?.state ?? 'idle') : 'offline',
      currentRunId: online ? (d?.currentRunId ?? null) : null,
      dockerAvailable: d?.dockerAvailable ?? null,
      geminiConfigured: d?.geminiConfigured ?? null,
      typesafeConfigured: d?.typesafeConfigured ?? null,
      strategyProvider: d?.strategyProvider ?? null,
      strategyModel: d?.strategyModel ?? null,
    };
  }

  async listRuns() {
    const snap = await this.runs().orderBy('createdAt', 'desc').limit(50).get();
    return snap.docs.map((d) => d.data());
  }

  async getRun(id: string) {
    const snap = await this.runs().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Araştırma bulunamadı');
    return snap.data();
  }

  async createRun(dto: CreateAiResearchRunDto, admin: PlatformAdminUser) {
    const city = AI_RESEARCH_CITIES[dto.city];
    if (!city) throw new AppException(ErrorCode.VALIDATION_ERROR, `Tanımsız şehir: ${dto.city}`);

    const districts = dto.districts?.length ? dto.districts : city.districts;
    const unknown = districts.filter((d) => !city.districts.includes(d));
    if (unknown.length) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `${city.name} ilçesi değil: ${unknown.join(', ')}`);
    }
    const keywords = (dto.keywords?.length ? dto.keywords : AI_RESEARCH_DEFAULT_KEYWORDS)
      .map((k) => k.trim())
      .filter(Boolean);

    const ref = this.runs().doc();
    const doc = {
      ...createBaseFields(ref.id, admin.uid),
      label: dto.label?.trim() || `${city.name} · ${districts.length === city.districts.length ? 'tüm ilçeler' : districts.join(', ')}`,
      city: dto.city,
      cityName: city.name,
      districts,
      keywords,
      sources: dto.sources?.length ? dto.sources : ['gmaps', 'osm'],
      depth: dto.depth ?? 10,
      // Boş liste = mesaj yazma (sadece keşif + sınıflandırma).
      strategyFor: dto.strategyFor ?? ['sicak', 'ilik'],
      status: 'queued',
      step: null,
      progress: null,
      stats: null,
      error: null,
      createdByEmail: admin.email,
      startedAt: null,
      finishedAt: null,
    };
    await ref.set(doc);

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'AI_RESEARCH_RUN_CREATED',
      targetType: 'aiResearchRun',
      targetId: ref.id,
      after: { city: dto.city, districts, keywords },
    });
    return doc;
  }

  /**
   * Kuyruktaki iş hemen iptal olur. Çalışan işi runner bir sonraki kontrolde durdurur; ama runner
   * çevrimdışıysa ya da başka bir işle meşgulse (ör. yeniden başlatılınca yarıda kalmış iş) bekleyecek
   * kimse yoktur, o zaman da hemen iptal edilir.
   */
  async cancelRun(id: string, admin: PlatformAdminUser) {
    const ref = this.runs().doc(id);
    const runner = await this.getRunnerStatus();
    const runnerOwnsRun = runner.online && runner.currentRunId === id;
    return this.firebase.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Araştırma bulunamadı');
      const run = snap.data() as Doc;
      if (run.status !== 'queued' && run.status !== 'running') {
        throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Sadece bekleyen veya çalışan araştırma iptal edilebilir');
      }
      const now = new Date().toISOString();
      const patch =
        run.status === 'queued' || !runnerOwnsRun
          ? { status: 'cancelled', cancelRequested: false, step: null, finishedAt: now, updatedAt: now, updatedBy: admin.uid }
          : { cancelRequested: true, updatedAt: now, updatedBy: admin.uid };
      tx.update(ref, patch);
      return { ...run, ...patch };
    });
  }

  /**
   * Hatalı veya iptal edilmiş araştırmayı yeniden kuyruğa alır. Runner aynı klasörü kullandığı için
   * tamamlanmış adımları (Maps sorguları, kontrol edilmiş siteler, analizler) tekrar yapmaz.
   */
  async retryRun(id: string, admin: PlatformAdminUser) {
    const ref = this.runs().doc(id);
    return this.firebase.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Araştırma bulunamadı');
      const run = snap.data() as Doc;
      if (run.status !== 'failed' && run.status !== 'cancelled') {
        throw new AppException(ErrorCode.CRM_INVALID_STATE, 'Sadece hatalı veya iptal edilmiş araştırma tekrar denenebilir');
      }
      if (run.origin === 'cli') {
        throw new AppException(ErrorCode.CRM_INVALID_STATE, 'CLI ile yüklenen araştırma panelden tekrar çalıştırılamaz');
      }
      const now = new Date().toISOString();
      const patch = {
        status: 'queued',
        step: null,
        progress: null,
        error: null,
        cancelRequested: false,
        finishedAt: null,
        retryCount: (run.retryCount ?? 0) + 1,
        updatedAt: now,
        updatedBy: admin.uid,
      };
      tx.update(ref, patch);
      return { ...run, ...patch };
    });
  }

  async listLeads(f: AiLeadListFilters) {
    const snap = f.runId
      ? await this.leads().where('runIds', 'array-contains', f.runId).get()
      : await this.leads().orderBy('lastSeenAt', 'desc').limit(2000).get();

    const q = f.q?.trim().toLocaleLowerCase('tr-TR');
    const items = snap.docs
      .map((d) => d.data())
      .filter((d) => !f.priority || d.insight?.priority === f.priority)
      .filter((d) => !f.status || (d.pipeline?.status ?? 'new') === f.status)
      .filter((d) => !f.district || d.district === f.district)
      .filter((d) => !f.segment || d.insight?.segment === f.segment)
      .filter((d) =>
        !f.competitor
          ? true
          : f.competitor === 'none'
            ? !(d.enrichment?.competitors ?? []).length
            : (d.enrichment?.competitors ?? []).length > 0,
      )
      .filter((d) => {
        if (!f.product) return true;
        const { products } = leadProducts(d);
        return f.product === AI_LEAD_PRODUCT_UNKNOWN ? products.length === 0 : products.includes(f.product);
      })
      .filter((d) => !q || `${d.name} ${d.district ?? ''} ${d.address ?? ''}`.toLocaleLowerCase('tr-TR').includes(q))
      .map(toListItem);

    items.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.insight?.priority ?? ''] ?? 3) - (PRIORITY_ORDER[b.insight?.priority ?? ''] ?? 3) ||
        (b.insight?.odivonFit ?? 0) - (a.insight?.odivonFit ?? 0) ||
        (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
    );

    const summary = {
      total: items.length,
      sicak: 0,
      ilik: 0,
      soguk: 0,
      unclassified: 0,
      /** Ürün kategorisi başına lead sayısı; `unknown` = ürün atanmamış. */
      products: {} as Record<string, number>,
    };
    for (const i of items) {
      const p = i.insight?.priority as 'sicak' | 'ilik' | 'soguk' | undefined;
      if (p) summary[p]++;
      else summary.unclassified++;
      const keys = i.products.length ? i.products : [AI_LEAD_PRODUCT_UNKNOWN];
      for (const k of keys) summary.products[k] = (summary.products[k] ?? 0) + 1;
    }
    return { items, summary };
  }

  async getLead(id: string) {
    const snap = await this.leads().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    const d = snap.data() as Doc;
    const products = leadProducts(d);
    return { ...d, products: products.products, productsInferred: products.inferred, contact: leadContact(d) };
  }

  async updateLead(id: string, dto: UpdateAiLeadDto, admin: PlatformAdminUser) {
    const ref = this.leads().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    const current = (snap.data() as Doc).pipeline ?? { status: 'new' };
    const now = new Date().toISOString();
    const contactPatch = Object.fromEntries(
      (['contactName', 'email', 'whatsapp'] as const)
        .filter((k) => dto[k] !== undefined)
        .map((k) => [k, dto[k]!.trim() || null]),
    );
    const pipeline = {
      ...current,
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(dto.products !== undefined ? { products: [...new Set(dto.products)] } : {}),
      ...(Object.keys(contactPatch).length ? { contact: { ...(current.contact ?? {}), ...contactPatch } } : {}),
      updatedAt: now,
      updatedBy: admin.uid,
      updatedByEmail: admin.email,
    };
    // Sadece pipeline alanı değişir; runner sonraki taramalarda bu alana dokunmaz.
    await ref.update({ pipeline });
    if (dto.products !== undefined) {
      await this.audit.record({
        adminUid: admin.uid,
        adminEmail: admin.email,
        action: 'AI_LEAD_PRODUCTS_UPDATED',
        targetType: 'aiLead',
        targetId: id,
        before: { products: current.products ?? null },
        after: { products: pipeline.products },
      });
    }
    return { id, pipeline };
  }

  /** Seçili lead'lere toplu ürün kategorisi atar (tek Firestore batch, en fazla 200 lead). */
  async bulkUpdateProducts(dto: BulkUpdateAiLeadProductsDto, admin: PlatformAdminUser) {
    const ids = [...new Set(dto.leadIds)];
    const refs = ids.map((id) => this.leads().doc(id));
    const snaps = await this.firebase.db.getAll(...refs);
    const mode = dto.mode ?? 'set';
    const now = new Date().toISOString();
    const batch = this.firebase.db.batch();
    let updated = 0;
    const missing: string[] = [];
    for (const snap of snaps) {
      if (!snap.exists) {
        missing.push(snap.id);
        continue;
      }
      const d = snap.data() as Doc;
      const current = leadProducts(d).products;
      const next =
        mode === 'set'
          ? dto.products
          : mode === 'add'
            ? [...current, ...dto.products]
            : current.filter((p) => !dto.products.includes(p));
      batch.update(snap.ref, {
        'pipeline.products': [...new Set(next)],
        'pipeline.updatedAt': now,
        'pipeline.updatedBy': admin.uid,
        'pipeline.updatedByEmail': admin.email,
      });
      updated++;
    }
    if (updated) await batch.commit();
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'AI_LEAD_PRODUCTS_BULK_UPDATED',
      targetType: 'aiLead',
      targetId: ids.length === 1 ? ids[0] : `${ids.length} lead`,
      after: { mode, products: dto.products, updated, leadIds: ids.slice(0, 50) },
    });
    return { updated, missing };
  }
}

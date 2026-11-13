import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import {
  AI_RESEARCH_CITIES,
  AI_RESEARCH_DEFAULT_KEYWORDS,
  AI_RUNNER_OFFLINE_AFTER_MS,
  AI_RUNNER_SETTINGS_DOC,
} from './ai-research.config';
import { CreateAiResearchRunDto, UpdateAiLeadDto } from './dto';

export interface AiLeadListFilters {
  runId?: string;
  priority?: string;
  status?: string;
  district?: string;
  segment?: string;
  competitor?: string;
  q?: string;
}

type Doc = Record<string, any>;

/** Liste ekranında gereken alanlar; strateji metinleri ve yorumlar detayda gelir. */
function toListItem(d: Doc) {
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
    };
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
      .filter((d) => !q || `${d.name} ${d.district ?? ''} ${d.address ?? ''}`.toLocaleLowerCase('tr-TR').includes(q))
      .map(toListItem);

    items.sort(
      (a, b) =>
        (PRIORITY_ORDER[a.insight?.priority ?? ''] ?? 3) - (PRIORITY_ORDER[b.insight?.priority ?? ''] ?? 3) ||
        (b.insight?.odivonFit ?? 0) - (a.insight?.odivonFit ?? 0) ||
        (b.reviewCount ?? 0) - (a.reviewCount ?? 0),
    );

    const summary = { total: items.length, sicak: 0, ilik: 0, soguk: 0, unclassified: 0 };
    for (const i of items) {
      const p = i.insight?.priority as 'sicak' | 'ilik' | 'soguk' | undefined;
      if (p) summary[p]++;
      else summary.unclassified++;
    }
    return { items, summary };
  }

  async getLead(id: string) {
    const snap = await this.leads().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    return snap.data();
  }

  async updateLead(id: string, dto: UpdateAiLeadDto, admin: PlatformAdminUser) {
    const ref = this.leads().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.CRM_NOT_FOUND, 'Potansiyel müşteri bulunamadı');
    const current = (snap.data() as Doc).pipeline ?? { status: 'new' };
    const now = new Date().toISOString();
    const pipeline = {
      ...current,
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      updatedAt: now,
      updatedBy: admin.uid,
      updatedByEmail: admin.email,
    };
    // Sadece pipeline alanı değişir; runner sonraki taramalarda bu alana dokunmaz.
    await ref.update({ pipeline });
    return { id, pipeline };
  }
}

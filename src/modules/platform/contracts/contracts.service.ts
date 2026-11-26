import { Injectable, Optional } from '@nestjs/common';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { SaasPricingService } from '../../saas-pricing/saas-pricing.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { fillPlaceholders, partyVariables, renderClauses } from './contract-render';
import {
  CONTRACT_PLACEHOLDERS,
  SAMPLE_CLAUSES,
  SAMPLE_DISCLAIMER,
  defaultContractTitle,
  productLabel,
  sampleClausesFor,
  toContractClause,
} from './contract-samples';
import {
  CLAUSE_CATEGORIES,
  CLAUSE_CATEGORY_LABELS,
  CONTRACT_KINDS,
  CONTRACT_KIND_LABELS,
  ContractClause,
  ContractKind,
  ContractPartySettings,
  ContractProduct,
  EMPTY_PARTY,
  PlatformContract,
} from './contract.types';
import {
  ContractClauseDto,
  CreateContractDto,
  CreateFromSampleDto,
  ListContractsQueryDto,
  PreviewContractDto,
  UpdateContractDto,
  UpdateContractPartyDto,
} from './dto';

const PARTY_DOC = 'contractParty';

/** Türlerin sırası: satış sözleşmesi en başta. */
function kindOrder(kind: ContractKind): number {
  return CONTRACT_KINDS.indexOf(kind);
}

const STATUS_ORDER = { active: 0, draft: 1, archived: 2 } as const;

export function sortContracts(items: PlatformContract[]): PlatformContract[] {
  return [...items].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      kindOrder(a.kind) - kindOrder(b.kind) ||
      b.updatedAt.localeCompare(a.updatedAt),
  );
}

/** "1.0" → "1.1", "2" → "3", tanınmayan → "<v>-yeni". */
export function nextContractVersion(version: string): string {
  const parts = version.trim().split('.');
  const last = Number.parseInt(parts[parts.length - 1], 10);
  if (Number.isNaN(last)) return `${version.trim()}-yeni`;
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

function normalizeClauses(clauses: ContractClauseDto[]): ContractClause[] {
  const usedIds = new Set<string>();
  return clauses.map((c, index) => {
    let id = c.id?.trim() || `c${index + 1}`;
    while (usedIds.has(id)) id = `${id}x`;
    usedIds.add(id);
    return {
      id,
      title: c.title.trim(),
      body: c.body.trim(),
      category: c.category,
      sampleId: c.sampleId ?? null,
    };
  });
}

@Injectable()
export class PlatformContractsService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
    @Optional() private readonly pricing?: SaasPricingService,
  ) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.platformContracts);
  }

  private partyRef() {
    return this.firebase.db.collection(ROOT_COLLECTION.platformSettings).doc(PARTY_DOC);
  }

  private async loadAll(): Promise<PlatformContract[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((d) => d.data() as PlatformContract);
  }

  private async get(id: string): Promise<PlatformContract> {
    const snap = await this.collection().doc(id).get();
    if (!snap.exists) throw new AppException(ErrorCode.CONTRACT_NOT_FOUND, 'Sözleşme bulunamadı');
    return snap.data() as PlatformContract;
  }

  /** Panelin ihtiyaç duyduğu sabit listeler: türler, madde kategorileri, yer tutucular, örnek maddeler. */
  config() {
    return {
      disclaimer: SAMPLE_DISCLAIMER,
      kinds: CONTRACT_KINDS.map((kind) => ({ value: kind, label: CONTRACT_KIND_LABELS[kind] })),
      categories: CLAUSE_CATEGORIES.map((c) => ({ value: c, label: CLAUSE_CATEGORY_LABELS[c] })),
      placeholders: CONTRACT_PLACEHOLDERS,
      samples: SAMPLE_CLAUSES,
    };
  }

  async list(query: ListContractsQueryDto) {
    const all = await this.loadAll();
    const items = sortContracts(
      all.filter(
        (c) =>
          (!query.product || query.product === 'any' || c.product === query.product) &&
          (!query.kind || query.kind === 'all' || c.kind === query.kind) &&
          (!query.status || query.status === 'all' || c.status === query.status),
      ),
    );
    return { items, total: items.length };
  }

  /** Her ürün için satış sözleşmesi durumu ve tür bazında yürürlükteki sözleşmeler. */
  async products() {
    const all = await this.loadAll();
    const products: ContractProduct[] = ['all', ...PRODUCT_MODULES];
    return {
      products: products.map((product) => {
        const own = all.filter((c) => c.product === product);
        const activeSales = own.find((c) => c.kind === 'sales' && c.status === 'active') ?? null;
        const draftSales = sortContracts(own.filter((c) => c.kind === 'sales' && c.status === 'draft'))[0] ?? null;
        const active = own.filter((c) => c.status === 'active');
        return {
          product,
          label: productLabel(product),
          sales: activeSales ? this.summary(activeSales) : null,
          salesDraft: draftSales ? this.summary(draftSales) : null,
          activeKinds: active.map((c) => c.kind).sort((a, b) => kindOrder(a) - kindOrder(b)),
          total: own.length,
          draftCount: own.filter((c) => c.status === 'draft').length,
        };
      }),
    };
  }

  private summary(c: PlatformContract) {
    return {
      id: c.id,
      title: c.title,
      version: c.version,
      status: c.status,
      legalReviewed: c.legalReviewed,
      publishedAt: c.publishedAt,
      updatedAt: c.updatedAt,
    };
  }

  async detail(id: string) {
    return this.get(id);
  }

  async create(dto: CreateContractDto, admin: PlatformAdminUser): Promise<PlatformContract> {
    const now = new Date().toISOString();
    const ref = this.collection().doc();
    const contract: PlatformContract = {
      id: ref.id,
      title: dto.title.trim(),
      kind: dto.kind,
      product: dto.product,
      version: dto.version?.trim() || '1.0',
      status: 'draft',
      summary: dto.summary?.trim() || null,
      clauses: normalizeClauses(dto.clauses ?? []),
      requiresAcceptance: dto.requiresAcceptance ?? true,
      legalReviewed: false,
      legalReviewedBy: null,
      legalReviewedAt: null,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom).toISOString() : null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: admin.email,
      updatedBy: admin.email,
    };
    await ref.set(contract);
    await this.record(admin, 'CONTRACT_CREATED', contract.id, null, {
      title: contract.title,
      kind: contract.kind,
      product: contract.product,
      version: contract.version,
    });
    return contract;
  }

  /** Örnek maddelerle (genel + ürüne özel sorumluluk maddeleri) taslak oluşturur. */
  async createFromSample(dto: CreateFromSampleDto, admin: PlatformAdminUser): Promise<PlatformContract> {
    const clauses = sampleClausesFor(dto.kind, dto.product).map(toContractClause);
    return this.create(
      {
        title: dto.title?.trim() || defaultContractTitle(dto.kind, dto.product),
        kind: dto.kind,
        product: dto.product,
        version: '1.0',
        summary: `Örnek maddelerden oluşturuldu. ${SAMPLE_DISCLAIMER}`,
        clauses,
        requiresAcceptance: dto.kind !== 'kvkk_notice',
      },
      admin,
    );
  }

  async update(id: string, dto: UpdateContractDto, admin: PlatformAdminUser): Promise<PlatformContract> {
    const current = await this.get(id);
    if (current.status === 'archived') {
      throw new AppException(ErrorCode.CONTRACT_INVALID_STATE, 'Arşivdeki sözleşme düzenlenemez; kopyalayıp yeni sürüm oluşturun');
    }
    const movesSlot =
      (dto.kind && dto.kind !== current.kind) || (dto.product && dto.product !== current.product);
    if (current.status === 'active' && movesSlot) {
      throw new AppException(ErrorCode.CONTRACT_INVALID_STATE, 'Yürürlükteki sözleşmenin ürünü veya türü değiştirilemez');
    }
    const contentChanged = dto.clauses !== undefined || (dto.title !== undefined && dto.title.trim() !== current.title);
    const now = new Date().toISOString();
    const patch: Partial<PlatformContract> = {
      ...(dto.title ? { title: dto.title.trim() } : {}),
      ...(dto.kind ? { kind: dto.kind } : {}),
      ...(dto.product ? { product: dto.product } : {}),
      ...(dto.version ? { version: dto.version.trim() } : {}),
      ...(dto.summary !== undefined ? { summary: dto.summary.trim() || null } : {}),
      ...(dto.clauses !== undefined ? { clauses: normalizeClauses(dto.clauses) } : {}),
      ...(dto.requiresAcceptance !== undefined ? { requiresAcceptance: dto.requiresAcceptance } : {}),
      ...(dto.effectiveFrom !== undefined
        ? { effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom).toISOString() : null }
        : {}),
      updatedAt: now,
      updatedBy: admin.email,
    };
    if (dto.legalReviewed !== undefined) {
      patch.legalReviewed = dto.legalReviewed;
      patch.legalReviewedBy = dto.legalReviewed ? admin.email : null;
      patch.legalReviewedAt = dto.legalReviewed ? now : null;
    } else if (contentChanged && current.legalReviewed) {
      // Metin değişti: hukuk onayı yeniden gerekir.
      patch.legalReviewed = false;
      patch.legalReviewedBy = null;
      patch.legalReviewedAt = null;
    }
    await this.collection().doc(id).update(patch);
    await this.record(admin, 'CONTRACT_UPDATED', id, { version: current.version, status: current.status }, {
      fields: Object.keys(patch).filter((k) => k !== 'updatedAt' && k !== 'updatedBy'),
    });
    return { ...current, ...patch };
  }

  /** Yürürlüğe alır; aynı ürün + türdeki önceki yürürlükteki sözleşme arşivlenir. */
  async activate(id: string, admin: PlatformAdminUser) {
    const contract = await this.get(id);
    if (contract.status === 'active') return { contract, archived: [] as string[] };
    if (!contract.clauses.length || contract.clauses.every((c) => !c.body.trim())) {
      throw new AppException(ErrorCode.CONTRACT_INVALID_STATE, 'En az bir madde içermeyen sözleşme yürürlüğe alınamaz');
    }
    const siblings = await this.collection().where('product', '==', contract.product).get();
    const toArchive = siblings.docs
      .map((d) => d.data() as PlatformContract)
      .filter((c) => c.id !== id && c.kind === contract.kind && c.status === 'active');
    const now = new Date().toISOString();
    const batch = this.firebase.db.batch();
    for (const old of toArchive) {
      batch.update(this.collection().doc(old.id), { status: 'archived', updatedAt: now, updatedBy: admin.email });
    }
    const patch: Partial<PlatformContract> = {
      status: 'active',
      publishedAt: now,
      effectiveFrom: contract.effectiveFrom ?? now,
      updatedAt: now,
      updatedBy: admin.email,
    };
    batch.update(this.collection().doc(id), patch);
    await batch.commit();
    await this.record(admin, 'CONTRACT_ACTIVATED', id, null, {
      product: contract.product,
      kind: contract.kind,
      version: contract.version,
      legalReviewed: contract.legalReviewed,
      archived: toArchive.map((c) => c.id),
    });
    return { contract: { ...contract, ...patch }, archived: toArchive.map((c) => c.id) };
  }

  async archive(id: string, admin: PlatformAdminUser): Promise<PlatformContract> {
    const contract = await this.get(id);
    if (contract.status === 'archived') return contract;
    const patch = { status: 'archived' as const, updatedAt: new Date().toISOString(), updatedBy: admin.email };
    await this.collection().doc(id).update(patch);
    await this.record(admin, 'CONTRACT_ARCHIVED', id, { status: contract.status }, { status: 'archived' });
    return { ...contract, ...patch };
  }

  /** Yeni sürüm taslağı: maddeler kopyalanır, sürüm numarası bir artar. */
  async duplicate(id: string, admin: PlatformAdminUser): Promise<PlatformContract> {
    const source = await this.get(id);
    return this.create(
      {
        title: source.title,
        kind: source.kind,
        product: source.product,
        version: nextContractVersion(source.version),
        summary: source.summary ?? undefined,
        clauses: source.clauses,
        requiresAcceptance: source.requiresAcceptance,
      },
      admin,
    );
  }

  async remove(id: string, admin: PlatformAdminUser) {
    const contract = await this.get(id);
    if (contract.status === 'active') {
      throw new AppException(ErrorCode.CONTRACT_INVALID_STATE, 'Yürürlükteki sözleşme silinemez; önce arşivleyin');
    }
    await this.collection().doc(id).delete();
    await this.record(admin, 'CONTRACT_DELETED', id, { title: contract.title, version: contract.version }, null);
    return { success: true };
  }

  // ---- Satıcı bilgileri --------------------------------------------------------------------

  async party(): Promise<ContractPartySettings> {
    const snap = await this.partyRef().get();
    return { ...EMPTY_PARTY, ...((snap.exists ? snap.data() : {}) as Partial<ContractPartySettings>) };
  }

  async updateParty(dto: UpdateContractPartyDto, admin: PlatformAdminUser): Promise<ContractPartySettings> {
    const before = await this.party();
    const clean = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v).trim()]),
    );
    const next: ContractPartySettings = {
      ...before,
      ...clean,
      updatedAt: new Date().toISOString(),
      updatedBy: admin.email,
    };
    await this.partyRef().set(next);
    await this.record(admin, 'CONTRACT_PARTY_UPDATED', PARTY_DOC, null, { fields: Object.keys(clean) });
    return next;
  }

  // ---- Önizleme ------------------------------------------------------------------------------

  private async tenantVariables(tenantId: string): Promise<Record<string, string>> {
    const snap = await this.firebase.db.collection(ROOT_COLLECTION.tenants).doc(tenantId).get();
    if (!snap.exists) throw new AppException(ErrorCode.CONTRACT_NOT_FOUND, 'İşletme bulunamadı');
    const tenant = snap.data() as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    let email = str(tenant.email) || str(tenant.ownerEmail);
    let phone = str(tenant.phone);
    const ownerUid = str(tenant.ownerUid);
    if ((!email || !phone) && ownerUid) {
      const owner = await this.firebase.db.collection(ROOT_COLLECTION.users).doc(ownerUid).get();
      const data = (owner.data() ?? {}) as Record<string, unknown>;
      email ||= str(data.email);
      phone ||= str(data.phone);
    }
    return {
      alici_unvan: str(tenant.legalName) || str(tenant.name),
      alici_adres: str(tenant.address),
      alici_vergi_no: str(tenant.taxNumber),
      alici_eposta: email,
      alici_telefon: phone,
    };
  }

  private async packageVariables(product: ContractProduct): Promise<Record<string, string>> {
    if (!this.pricing || product === 'all') return {};
    try {
      const catalog = await this.pricing.catalog(product as ProductModule);
      const plan = catalog.plans.find((p) => p.active && p.monthly != null);
      if (!plan) return {};
      return {
        paket_adi: plan.name,
        fiyat: plan.monthly!.toLocaleString('tr-TR'),
        odeme_donemi: 'aylık',
      };
    } catch {
      return {};
    }
  }

  /**
   * Sözleşmeyi yer tutucular doldurulmuş olarak döndürür. Doldurulamayan alanlar `missing` listesinde
   * gelir; böylece panel eksik satıcı/alıcı bilgilerini gösterebilir.
   */
  async preview(id: string, dto: PreviewContractDto) {
    const contract = await this.get(id);
    return this.render(contract, dto.tenantId);
  }

  async render(contract: PlatformContract, tenantId?: string) {
    const party = await this.party();
    const vars: Record<string, string> = {
      ...partyVariables(party),
      urun_adi: contract.product === 'all' ? `${party.shortName || 'Odivon'}` : `${party.shortName || 'Odivon'} ${productLabel(contract.product)}`,
      surum: contract.version,
      tarih: new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }),
      ...(await this.packageVariables(contract.product)),
      ...(tenantId ? await this.tenantVariables(tenantId) : {}),
    };
    const title = fillPlaceholders(contract.title, vars);
    const body = renderClauses(contract.clauses, vars);
    const missing = [...new Set([...title.missing, ...body.missing])];
    return {
      id: contract.id,
      title: title.text,
      kind: contract.kind,
      kindLabel: CONTRACT_KIND_LABELS[contract.kind],
      product: contract.product,
      productLabel: productLabel(contract.product),
      version: contract.version,
      status: contract.status,
      legalReviewed: contract.legalReviewed,
      effectiveFrom: contract.effectiveFrom,
      requiresAcceptance: contract.requiresAcceptance,
      clauses: body.clauses,
      missing: missing.map((key) => ({ key, label: CONTRACT_PLACEHOLDERS.find((p) => p.key === key)?.label ?? key })),
    };
  }

  /**
   * Ürün uygulamalarının ödeme ekranında göstereceği yürürlükteki sözleşme (giriş gerektirmez).
   * Ürüne özel sözleşme yoksa "Tüm Ürünler" sözleşmesine düşer.
   */
  async activeFor(product: string, kind: string) {
    if (!(CONTRACT_KINDS as readonly string[]).includes(kind)) {
      throw new AppException(ErrorCode.CONTRACT_NOT_FOUND, 'Sözleşme türü bulunamadı');
    }
    const candidates = product === 'all' ? ['all'] : [product, 'all'];
    for (const p of candidates) {
      const snap = await this.collection().where('product', '==', p).get();
      const active = snap.docs
        .map((d) => d.data() as PlatformContract)
        .find((c) => c.kind === kind && c.status === 'active');
      if (active) {
        return this.render(active);
      }
    }
    throw new AppException(ErrorCode.CONTRACT_NOT_FOUND, 'Bu ürün için yürürlükte sözleşme yok');
  }

  private record(
    admin: PlatformAdminUser,
    action: string,
    targetId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ) {
    return this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action,
      targetType: 'contract',
      targetId,
      before,
      after,
    });
  }
}

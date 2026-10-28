import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  CompleteFoodLabelOnboardingDto,
  CreateFoodLabelRecordDto,
  FoodLabelListQueryDto,
  UpdateFoodLabelRecordDto,
} from './food-label.dto';
import {
  FOOD_LABEL_AUDIT_EVENTS,
  FOOD_LABEL_COLLECTIONS,
  FOOD_LABEL_PLAN_LIMITS,
} from './food-label.constants';
import { FoodLabelRecord } from './food-label.types';

@Injectable()
export class FoodLabelRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: FoodLabelListQueryDto) {
    const snapshot = await this.collection(FOOD_LABEL_COLLECTIONS.records).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs
      .map((doc) => ({ ...(doc.data() as FoodLabelRecord), id: doc.id }))
      .filter((item) => Boolean(item.archivedAt) === query.archived)
      .filter((item) => !query.kind || item.kind === query.kind)
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !search ||
          `${item.name} ${item.location} ${item.market ?? ''} ${item.sku ?? ''} ${item.brand ?? ''} ${item.ingredients ?? ''} ${item.allergens.join(' ')} ${item.responsibleName ?? ''}`
            .toLocaleLowerCase('tr-TR')
            .includes(search),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = query.cursor
      ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) || 0
      : 0;
    const items = rows.slice(start, start + query.limit);
    return {
      items,
      nextCursor:
        start + query.limit < rows.length
          ? Buffer.from(String(start + query.limit)).toString('base64url')
          : null,
    };
  }

  async get(id: string): Promise<FoodLabelRecord> {
    const snapshot = await this.collection(FOOD_LABEL_COLLECTIONS.records).doc(id).get();
    if (!snapshot.exists)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_NOT_FOUND,
        'Gıda etiketi kaydı bulunamadı.',
      );
    return { ...(snapshot.data() as FoodLabelRecord), id: snapshot.id };
  }

  async create(dto: CreateFoodLabelRecordDto): Promise<FoodLabelRecord> {
    await this.assertCapacity();
    const now = new Date().toISOString();
    const ref = this.collection(FOOD_LABEL_COLLECTIONS.records).doc();
    const record: FoodLabelRecord = {
      id: ref.id,
      tenantId: this.tenant.getTenantId(),
      kind: dto.kind,
      name: dto.name.trim(),
      location: dto.location.trim(),
      market: dto.market?.trim() ?? null,
      sku: dto.sku?.trim() ?? null,
      brand: dto.brand?.trim() ?? null,
      locale: dto.locale?.trim() ?? null,
      netQuantity: dto.netQuantity?.trim() ?? null,
      ingredients: dto.ingredients?.trim() ?? null,
      allergens: dto.allergens?.map((item) => item.trim()).filter(Boolean) ?? [],
      claims: dto.claims?.map((item) => item.trim()).filter(Boolean) ?? [],
      energyKcal: dto.energyKcal ?? null,
      proteinG: dto.proteinG ?? null,
      carbohydratesG: dto.carbohydratesG ?? null,
      fatG: dto.fatG ?? null,
      saltG: dto.saltG ?? null,
      responsibleName: dto.responsibleName?.trim() ?? null,
      reviewDueAt: dto.reviewDueAt ?? null,
      approvedAt: dto.approvedAt ?? null,
      notes: dto.notes?.trim() ?? null,
      documentRefs: dto.documentRefs?.map((item) => item.trim()).filter(Boolean) ?? [],
      status: dto.status ?? 'draft',
      version: 1,
      createdAt: now,
      createdBy: this.tenant.getUserId(),
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: null,
      archivedBy: null,
    };
    this.validateCompleted(record);
    await ref.set(record);
    await this.writeEvidence(record, FOOD_LABEL_AUDIT_EVENTS.created);
    return record;
  }

  async update(id: string, dto: UpdateFoodLabelRecordDto): Promise<FoodLabelRecord> {
    const current = await this.get(id);
    if (current.archivedAt)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Arşivlenmiş Gıda etiketi kaydı güncellenemez.',
      );
    if (current.version !== dto.expectedVersion)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Kayıt başka bir kullanıcı tarafından güncellendi.',
      );
    const now = new Date().toISOString();
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const record: FoodLabelRecord = {
      ...current,
      ...changes,
      name: dto.name?.trim() ?? current.name,
      location: dto.location?.trim() ?? current.location,
      market: dto.market?.trim() ?? current.market,
      sku: dto.sku?.trim() ?? current.sku,
      brand: dto.brand?.trim() ?? current.brand,
      locale: dto.locale?.trim() ?? current.locale,
      netQuantity: dto.netQuantity?.trim() ?? current.netQuantity,
      ingredients: dto.ingredients?.trim() ?? current.ingredients,
      allergens: dto.allergens?.map((item) => item.trim()).filter(Boolean) ?? current.allergens,
      claims: dto.claims?.map((item) => item.trim()).filter(Boolean) ?? current.claims,
      responsibleName: dto.responsibleName?.trim() ?? current.responsibleName,
      notes: dto.notes?.trim() ?? current.notes,
      documentRefs:
        dto.documentRefs?.map((item) => item.trim()).filter(Boolean) ?? current.documentRefs,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
    };
    this.validateCompleted(record);
    await this.collection(FOOD_LABEL_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, FOOD_LABEL_AUDIT_EVENTS.updated);
    return record;
  }

  archive(id: string): Promise<FoodLabelRecord> {
    return this.setArchive(id, true);
  }
  restore(id: string): Promise<FoodLabelRecord> {
    return this.setArchive(id, false);
  }

  async dashboard() {
    const records = (await this.collection(FOOD_LABEL_COLLECTIONS.records).get()).docs
      .map((doc) => doc.data() as FoodLabelRecord)
      .filter((row) => !row.archivedAt);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const dueSoon = records.filter((row) => {
      const date = row.reviewDueAt?.slice(0, 10);
      return date && date >= today && date <= upcoming;
    }).length;
    const actionRequired = records.filter((row) =>
      ['action-required', 'draft'].includes(row.status),
    ).length;
    return {
      total: records.length,
      products: records.filter((row) => row.kind === 'product').length,
      recipes: records.filter((row) => row.kind === 'recipe').length,
      allergenReviews: records.filter((row) => row.kind === 'allergen-review').length,
      approvals: records.filter((row) => row.kind === 'approval').length,
      approved: records.filter((row) => row.status === 'approved').length,
      dueSoon,
      actionRequired,
      complianceScore: records.length
        ? Math.round(((records.length - actionRequired) / records.length) * 100)
        : 100,
    };
  }

  async audit(recordId: string) {
    await this.get(recordId);
    return (await this.collection(FOOD_LABEL_COLLECTIONS.audit).get()).docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((entry) => entry['entityId'] === recordId)
      .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])));
  }

  async allAudit(limit = 100) {
    return (await this.collection(FOOD_LABEL_COLLECTIONS.audit).get()).docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])))
      .slice(0, Math.min(Math.max(limit, 1), 200));
  }

  async entitlements() {
    const tenant = (
      await this.firebase.db.doc(`tenants/${this.tenant.getTenantId()}`).get()
    ).data() as { planId?: string; membershipStatus?: string } | undefined;
    const planId = tenant?.membershipStatus === 'trial' ? 'pro' : tenant?.planId;
    const normalized =
      planId === 'starter' || planId === 'pro' || planId === 'enterprise' ? planId : 'enterprise';
    const records = (await this.collection(FOOD_LABEL_COLLECTIONS.records).get()).docs.filter(
      (doc) => !doc.data()['archivedAt'],
    ).length;
    return { planId: normalized, ...FOOD_LABEL_PLAN_LIMITS[normalized], usage: { records } };
  }

  async completeOnboarding(dto: CompleteFoodLabelOnboardingDto) {
    const tenantId = this.tenant.getTenantId();
    const now = new Date().toISOString();
    const profile = {
      ...dto,
      legalName: dto.legalName.trim(),
      productionSite: dto.productionSite.trim(),
      regulatoryContactName: dto.regulatoryContactName.trim(),
      regulatoryContactEmail: dto.regulatoryContactEmail.trim().toLowerCase(),
      regulatoryContactPhone: dto.regulatoryContactPhone?.trim() ?? null,
      targetMarkets: dto.targetMarkets.map((item) => item.trim()).filter(Boolean),
      completedAt: now,
      completedBy: this.tenant.getUserId(),
    };
    await this.firebase.db
      .doc(`tenants/${tenantId}`)
      .update({ onboardingCompleted: true, foodLabelProfile: profile, updatedAt: now });
    return { onboardingCompleted: true, profile };
  }

  async complianceReport() {
    const records = (await this.collection(FOOD_LABEL_COLLECTIONS.records).get()).docs
      .map((doc) => ({ ...(doc.data() as FoodLabelRecord), id: doc.id }))
      .filter((row) => !row.archivedAt);
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      tenantId: this.tenant.getTenantId(),
      summary: await this.dashboard(),
      records,
      audit: await this.allAudit(200),
    };
  }

  private validateCompleted(record: FoodLabelRecord): void {
    if (record.status !== 'approved') return;
    const missing: string[] = [];
    if (!record.approvedAt) missing.push('onay tarihi');
    if (!record.responsibleName) missing.push('sorumlu kişi');
    if (['product', 'recipe'].includes(record.kind) && !record.ingredients)
      missing.push('bileşen listesi');
    if (record.kind === 'nutrition' && record.energyKcal === null) missing.push('enerji değeri');
    if (record.kind === 'approval' && !record.documentRefs.length) missing.push('onay kanıtı');
    if (missing.length)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_INVALID,
        `Onaylanan etiket kaydı için zorunlu alanlar eksik: ${missing.join(', ')}.`,
      );
  }

  private async assertCapacity(): Promise<void> {
    const access = await this.entitlements();
    if (access.records !== null && access.usage.records >= access.records)
      throw new AppException(
        ErrorCode.SUBSCRIPTION_LIMIT,
        `${access.planId} planının gıda etiketi kayıt limiti doldu. Planınızı yükseltin.`,
      );
  }

  private async setArchive(id: string, archived: boolean): Promise<FoodLabelRecord> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const record: FoodLabelRecord = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: archived ? now : null,
      archivedBy: archived ? this.tenant.getUserId() : null,
    };
    await this.collection(FOOD_LABEL_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(
      record,
      archived ? FOOD_LABEL_AUDIT_EVENTS.archived : FOOD_LABEL_AUDIT_EVENTS.restored,
    );
    return record;
  }

  private async writeEvidence(record: FoodLabelRecord, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(FOOD_LABEL_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(FOOD_LABEL_COLLECTIONS.audit).doc();
    await snapshotRef.set({
      id: snapshotRef.id,
      recordId: record.id,
      recordVersion: record.version,
      payload: record,
      createdAt: now,
      createdBy: this.tenant.getUserId(),
      immutable: true,
    });
    await auditRef.set({
      id: auditRef.id,
      event,
      entity: 'foodLabelRecord',
      entityId: record.id,
      version: record.version,
      actorId: this.tenant.getUserId(),
      createdAt: now,
    });
  }

  private collection(name: string) {
    return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), name));
  }
}

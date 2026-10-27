import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  CompleteFireSafeOnboardingDto,
  CreateFireSafeRecordDto,
  FireSafeListQueryDto,
  UpdateFireSafeRecordDto,
} from './fire-safe.dto';
import {
  FIRE_SAFE_AUDIT_EVENTS,
  FIRE_SAFE_COLLECTIONS,
  FIRE_SAFE_PLAN_LIMITS,
} from './fire-safe.constants';
import { FireSafeRecord } from './fire-safe.types';

@Injectable()
export class FireSafeRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: FireSafeListQueryDto) {
    const snapshot = await this.collection(FIRE_SAFE_COLLECTIONS.records).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs
      .map((doc) => ({ ...(doc.data() as FireSafeRecord), id: doc.id }))
      .filter((item) => Boolean(item.archivedAt) === query.archived)
      .filter((item) => !query.kind || item.kind === query.kind)
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !search ||
          `${item.name} ${item.location} ${item.facilityCode ?? ''} ${item.code ?? ''} ${item.category ?? ''} ${item.responsibleName ?? ''}`
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

  async get(id: string): Promise<FireSafeRecord> {
    const snapshot = await this.collection(FIRE_SAFE_COLLECTIONS.records).doc(id).get();
    if (!snapshot.exists)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_NOT_FOUND,
        'Yangın güvenliği kaydı bulunamadı.',
      );
    return { ...(snapshot.data() as FireSafeRecord), id: snapshot.id };
  }

  async create(dto: CreateFireSafeRecordDto): Promise<FireSafeRecord> {
    await this.assertCapacity();
    const now = new Date().toISOString();
    const ref = this.collection(FIRE_SAFE_COLLECTIONS.records).doc();
    const record: FireSafeRecord = {
      id: ref.id,
      tenantId: this.tenant.getTenantId(),
      kind: dto.kind,
      name: dto.name.trim(),
      location: dto.location.trim(),
      facilityCode: dto.facilityCode?.trim() ?? null,
      inspectionDueAt: dto.inspectionDueAt?.trim() ?? null,
      code: dto.code?.trim() ?? null,
      category: dto.category?.trim() ?? null,
      riskLevel: dto.riskLevel ?? null,
      responsibleName: dto.responsibleName?.trim() ?? null,
      completedAt: dto.completedAt ?? null,
      result: dto.result ?? null,
      notes: dto.notes?.trim() ?? null,
      documentRefs: dto.documentRefs?.map((item) => item.trim()).filter(Boolean) ?? [],
      status: dto.status ?? 'pending',
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
    await this.writeEvidence(record, FIRE_SAFE_AUDIT_EVENTS.created);
    return record;
  }

  async update(id: string, dto: UpdateFireSafeRecordDto): Promise<FireSafeRecord> {
    const current = await this.get(id);
    if (current.archivedAt)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Arşivlenmiş Yangın güvenliği kaydı güncellenemez.',
      );
    if (current.version !== dto.expectedVersion)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Kayıt başka bir kullanıcı tarafından güncellendi.',
      );
    const now = new Date().toISOString();
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const record: FireSafeRecord = {
      ...current,
      ...changes,
      name: dto.name?.trim() ?? current.name,
      location: dto.location?.trim() ?? current.location,
      facilityCode: dto.facilityCode?.trim() ?? current.facilityCode,
      inspectionDueAt: dto.inspectionDueAt?.trim() ?? current.inspectionDueAt,
      code: dto.code?.trim() ?? current.code,
      category: dto.category?.trim() ?? current.category,
      responsibleName: dto.responsibleName?.trim() ?? current.responsibleName,
      notes: dto.notes?.trim() ?? current.notes,
      documentRefs:
        dto.documentRefs?.map((item) => item.trim()).filter(Boolean) ?? current.documentRefs,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
    };
    this.validateCompleted(record);
    await this.collection(FIRE_SAFE_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, FIRE_SAFE_AUDIT_EVENTS.updated);
    return record;
  }

  archive(id: string): Promise<FireSafeRecord> {
    return this.setArchive(id, true);
  }
  restore(id: string): Promise<FireSafeRecord> {
    return this.setArchive(id, false);
  }

  async dashboard() {
    const records = (await this.collection(FIRE_SAFE_COLLECTIONS.records).get()).docs
      .map((doc) => doc.data() as FireSafeRecord)
      .filter((row) => !row.archivedAt);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const dueSoon = records.filter((row) => {
      const date = row.inspectionDueAt?.slice(0, 10);
      return date && date >= today && date <= upcoming;
    }).length;
    const actionRequired = records.filter((row) =>
      ['action-required', 'pending'].includes(row.status),
    ).length;
    return {
      total: records.length,
      equipment: records.filter((row) => row.kind === 'equipment').length,
      checks: records.filter((row) => row.kind === 'periodic-check').length,
      openNonconformities: records.filter(
        (row) => row.kind === 'nonconformity' && row.status !== 'closed',
      ).length,
      emergencyPlans: records.filter((row) => row.kind === 'emergency-plan').length,
      dueSoon,
      actionRequired,
      complianceScore: records.length
        ? Math.round(((records.length - actionRequired) / records.length) * 100)
        : 100,
    };
  }

  async audit(recordId: string) {
    await this.get(recordId);
    return (await this.collection(FIRE_SAFE_COLLECTIONS.audit).get()).docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((entry) => entry['entityId'] === recordId)
      .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])));
  }

  async allAudit(limit = 100) {
    return (await this.collection(FIRE_SAFE_COLLECTIONS.audit).get()).docs
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
    const records = (await this.collection(FIRE_SAFE_COLLECTIONS.records).get()).docs.filter(
      (doc) => !doc.data()['archivedAt'],
    ).length;
    return { planId: normalized, ...FIRE_SAFE_PLAN_LIMITS[normalized], usage: { records } };
  }

  async completeOnboarding(dto: CompleteFireSafeOnboardingDto) {
    const tenantId = this.tenant.getTenantId();
    const now = new Date().toISOString();
    const profile = {
      ...dto,
      legalName: dto.legalName.trim(),
      primaryFacility: dto.primaryFacility.trim(),
      safetyManagerName: dto.safetyManagerName.trim(),
      safetyManagerEmail: dto.safetyManagerEmail.trim().toLowerCase(),
      taxNumber: dto.taxNumber?.trim() ?? null,
      safetyManagerPhone: dto.safetyManagerPhone?.trim() ?? null,
      authorityName: dto.authorityName?.trim() ?? null,
      completedAt: now,
      completedBy: this.tenant.getUserId(),
    };
    await this.firebase.db
      .doc(`tenants/${tenantId}`)
      .update({ onboardingCompleted: true, fireSafeProfile: profile, updatedAt: now });
    return { onboardingCompleted: true, profile };
  }

  async complianceReport() {
    const records = (await this.collection(FIRE_SAFE_COLLECTIONS.records).get()).docs
      .map((doc) => ({ ...(doc.data() as FireSafeRecord), id: doc.id }))
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

  private validateCompleted(record: FireSafeRecord): void {
    if (!['completed', 'closed'].includes(record.status)) return;
    const missing: string[] = [];
    if (!record.completedAt) missing.push('tamamlanma tarihi');
    if (!record.responsibleName) missing.push('sorumlu kişi');
    if (record.kind === 'periodic-check' && !record.result) missing.push('kontrol sonucu');
    if (record.kind === 'nonconformity' && !record.notes) missing.push('kapanış açıklaması');
    if (missing.length)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_INVALID,
        `Tamamlanan kayıt için zorunlu alanlar eksik: ${missing.join(', ')}.`,
      );
  }

  private async assertCapacity(): Promise<void> {
    const access = await this.entitlements();
    if (access.records !== null && access.usage.records >= access.records)
      throw new AppException(
        ErrorCode.SUBSCRIPTION_LIMIT,
        `${access.planId} planının yangın güvenliği kayıt limiti doldu. Planınızı yükseltin.`,
      );
  }

  private async setArchive(id: string, archived: boolean): Promise<FireSafeRecord> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const record: FireSafeRecord = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: archived ? now : null,
      archivedBy: archived ? this.tenant.getUserId() : null,
    };
    await this.collection(FIRE_SAFE_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(
      record,
      archived ? FIRE_SAFE_AUDIT_EVENTS.archived : FIRE_SAFE_AUDIT_EVENTS.restored,
    );
    return record;
  }

  private async writeEvidence(record: FireSafeRecord, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(FIRE_SAFE_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(FIRE_SAFE_COLLECTIONS.audit).doc();
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
      entity: 'fireSafeRecord',
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

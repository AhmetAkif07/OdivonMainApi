import { Injectable } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  MACHINE_CE_AUDIT_EVENTS,
  MACHINE_CE_COLLECTIONS,
  MACHINE_CE_PLAN_LIMITS,
} from './machine-ce.constants';
import {
  CompleteMachineCeOnboardingDto,
  CreateMachineCeRecordDto,
  MachineCeListQueryDto,
  UpdateMachineCeRecordDto,
} from './machine-ce.dto';
import { MachineCeRecord } from './machine-ce.types';

@Injectable()
export class MachineCeRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: MachineCeListQueryDto) {
    const snapshot = await this.collection(MACHINE_CE_COLLECTIONS.records).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs
      .map((doc) => ({ ...(doc.data() as MachineCeRecord), id: doc.id }))
      .filter((item) => Boolean(item.archivedAt) === query.archived)
      .filter((item) => !query.kind || item.kind === query.kind)
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !search ||
          `${item.name} ${item.location} ${item.manufacturer ?? ''} ${item.model ?? ''} ${item.serialNumber ?? ''} ${item.directive ?? ''} ${(item.standardRefs ?? []).join(' ')} ${item.responsibleName ?? ''}`
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

  async get(id: string): Promise<MachineCeRecord> {
    const snapshot = await this.collection(MACHINE_CE_COLLECTIONS.records).doc(id).get();
    if (!snapshot.exists)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_NOT_FOUND,
        'Makine CE kaydı bulunamadı.',
      );
    return { ...(snapshot.data() as MachineCeRecord), id: snapshot.id };
  }

  async create(dto: CreateMachineCeRecordDto): Promise<MachineCeRecord> {
    await this.assertCapacity();
    const now = new Date().toISOString();
    const ref = this.collection(MACHINE_CE_COLLECTIONS.records).doc();
    const severity = dto.severity ?? null;
    const probability = dto.probability ?? null;
    const record: MachineCeRecord = {
      id: ref.id,
      tenantId: this.tenant.getTenantId(),
      kind: dto.kind,
      name: dto.name.trim(),
      location: dto.location.trim(),
      manufacturer: dto.manufacturer?.trim() ?? null,
      model: dto.model?.trim() ?? null,
      serialNumber: dto.serialNumber?.trim() ?? null,
      machineType: dto.machineType?.trim() ?? null,
      manufactureYear: dto.manufactureYear ?? null,
      directive: dto.directive?.trim() ?? null,
      standardRefs: dto.standardRefs?.map((item) => item.trim()).filter(Boolean) ?? [],
      hazard: dto.hazard?.trim() ?? null,
      severity,
      probability,
      riskScore: severity && probability ? severity * probability : null,
      protectiveMeasures: dto.protectiveMeasures?.trim() ?? null,
      residualRisk: dto.residualRisk?.trim() ?? null,
      responsibleName: dto.responsibleName?.trim() ?? null,
      assessmentDueAt: dto.assessmentDueAt?.trim() ?? null,
      approvedAt: dto.approvedAt?.trim() ?? null,
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
    this.validateApproved(record);
    await ref.set(record);
    await this.writeEvidence(record, MACHINE_CE_AUDIT_EVENTS.created);
    return record;
  }

  async update(id: string, dto: UpdateMachineCeRecordDto): Promise<MachineCeRecord> {
    const current = await this.get(id);
    if (current.archivedAt)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Arşivlenmiş Makine CE kaydı güncellenemez.',
      );
    if (current.version !== dto.expectedVersion)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Kayıt başka bir kullanıcı tarafından güncellendi.',
      );
    const now = new Date().toISOString();
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const severity = dto.severity !== undefined ? dto.severity : current.severity;
    const probability = dto.probability !== undefined ? dto.probability : current.probability;
    const record: MachineCeRecord = {
      ...current,
      ...changes,
      name: dto.name?.trim() ?? current.name,
      location: dto.location?.trim() ?? current.location,
      manufacturer: dto.manufacturer?.trim() ?? current.manufacturer,
      model: dto.model?.trim() ?? current.model,
      serialNumber: dto.serialNumber?.trim() ?? current.serialNumber,
      machineType: dto.machineType?.trim() ?? current.machineType,
      directive: dto.directive?.trim() ?? current.directive,
      standardRefs:
        dto.standardRefs?.map((item) => item.trim()).filter(Boolean) ?? current.standardRefs,
      hazard: dto.hazard?.trim() ?? current.hazard,
      severity: severity ?? null,
      probability: probability ?? null,
      riskScore: severity && probability ? severity * probability : null,
      protectiveMeasures: dto.protectiveMeasures?.trim() ?? current.protectiveMeasures,
      residualRisk: dto.residualRisk?.trim() ?? current.residualRisk,
      responsibleName: dto.responsibleName?.trim() ?? current.responsibleName,
      assessmentDueAt: dto.assessmentDueAt?.trim() ?? current.assessmentDueAt,
      approvedAt: dto.approvedAt?.trim() ?? current.approvedAt,
      notes: dto.notes?.trim() ?? current.notes,
      documentRefs:
        dto.documentRefs?.map((item) => item.trim()).filter(Boolean) ?? current.documentRefs,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
    };
    this.validateApproved(record);
    await this.collection(MACHINE_CE_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, MACHINE_CE_AUDIT_EVENTS.updated);
    return record;
  }

  archive(id: string): Promise<MachineCeRecord> {
    return this.setArchive(id, true);
  }

  restore(id: string): Promise<MachineCeRecord> {
    return this.setArchive(id, false);
  }

  async dashboard() {
    const records = (await this.collection(MACHINE_CE_COLLECTIONS.records).get()).docs
      .map((doc) => doc.data() as MachineCeRecord)
      .filter((row) => !row.archivedAt);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    const dueSoon = records.filter((row) => {
      const date = row.assessmentDueAt?.slice(0, 10);
      return date && date >= today && date <= upcoming;
    }).length;
    const actionRequired = records.filter((row) =>
      ['action-required', 'rejected'].includes(row.status),
    ).length;
    return {
      total: records.length,
      machines: records.filter((row) => row.kind === 'machine').length,
      riskAssessments: records.filter((row) => row.kind === 'risk-assessment').length,
      standards: records.filter((row) => row.kind === 'standard').length,
      technicalFiles: records.filter((row) => row.kind === 'technical-file').length,
      declarations: records.filter((row) => row.kind === 'declaration').length,
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
    return (await this.collection(MACHINE_CE_COLLECTIONS.audit).get()).docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((entry) => entry['entityId'] === recordId)
      .sort((a, b) => String(b['createdAt']).localeCompare(String(a['createdAt'])));
  }

  async allAudit(limit = 100) {
    return (await this.collection(MACHINE_CE_COLLECTIONS.audit).get()).docs
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
    const records = (await this.collection(MACHINE_CE_COLLECTIONS.records).get()).docs.filter(
      (doc) => !doc.data()['archivedAt'],
    ).length;
    return { planId: normalized, ...MACHINE_CE_PLAN_LIMITS[normalized], usage: { records } };
  }

  async completeOnboarding(dto: CompleteMachineCeOnboardingDto) {
    const tenantId = this.tenant.getTenantId();
    const now = new Date().toISOString();
    const profile = {
      ...dto,
      legalName: dto.legalName.trim(),
      productionSite: dto.productionSite.trim(),
      regulatoryContactName: dto.regulatoryContactName.trim(),
      regulatoryContactEmail: dto.regulatoryContactEmail.trim().toLowerCase(),
      taxNumber: dto.taxNumber?.trim() ?? null,
      regulatoryContactPhone: dto.regulatoryContactPhone?.trim() ?? null,
      targetMarkets: dto.targetMarkets.map((item) => item.trim()).filter(Boolean),
      completedAt: now,
      completedBy: this.tenant.getUserId(),
    };
    await this.firebase.db
      .doc(`tenants/${tenantId}`)
      .update({ onboardingCompleted: true, machineCeProfile: profile, updatedAt: now });
    return { onboardingCompleted: true, profile };
  }

  async complianceReport() {
    const records = (await this.collection(MACHINE_CE_COLLECTIONS.records).get()).docs
      .map((doc) => ({ ...(doc.data() as MachineCeRecord), id: doc.id }))
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

  private validateApproved(record: MachineCeRecord): void {
    if (record.status !== 'approved') return;
    const missing: string[] = [];
    if (!record.approvedAt) missing.push('onay tarihi');
    if (!record.responsibleName) missing.push('sorumlu kişi');
    if (!record.documentRefs.length) missing.push('kanıt belgesi');
    if (missing.length)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_INVALID,
        `Onaylanan CE kaydı için zorunlu alanlar eksik: ${missing.join(', ')}.`,
      );
  }

  private async assertCapacity(): Promise<void> {
    const access = await this.entitlements();
    if (access.records !== null && access.usage.records >= access.records)
      throw new AppException(
        ErrorCode.SUBSCRIPTION_LIMIT,
        `${access.planId} planının Makine CE kayıt limiti doldu. Planınızı yükseltin.`,
      );
  }

  private async setArchive(id: string, archived: boolean): Promise<MachineCeRecord> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const record: MachineCeRecord = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: archived ? now : null,
      archivedBy: archived ? this.tenant.getUserId() : null,
    };
    await this.collection(MACHINE_CE_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(
      record,
      archived ? MACHINE_CE_AUDIT_EVENTS.archived : MACHINE_CE_AUDIT_EVENTS.restored,
    );
    return record;
  }

  private async writeEvidence(record: MachineCeRecord, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(MACHINE_CE_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(MACHINE_CE_COLLECTIONS.audit).doc();
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
      entity: 'machineCeRecord',
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

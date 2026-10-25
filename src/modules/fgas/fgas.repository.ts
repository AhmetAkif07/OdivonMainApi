import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  CompleteFgasOnboardingDto,
  CreateFgasOperationDto,
  CreateFgasRecordDto,
  FgasListQueryDto,
  FgasOperationListQueryDto,
  UpdateFgasOperationDto,
  UpdateFgasRecordDto,
} from './fgas.dto';
import { FGAS_AUDIT_EVENTS, FGAS_COLLECTIONS } from './fgas.constants';
import { FgasAuditEntry, FgasOperation, FgasOperationKind, FgasRecord } from './fgas.types';

@Injectable()
export class FgasRepository {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenant: TenantContext,
  ) {}

  async list(query: FgasListQueryDto) {
    const snapshot = await this.collection(FGAS_COLLECTIONS.records).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasRecord), id: doc.id }))
      .filter((item) => Boolean(item.archivedAt) === query.archived)
      .filter(
        (item) =>
          !search ||
          `${item.name} ${item.location} ${item.equipmentCode ?? ''}`
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

  async get(id: string): Promise<FgasRecord> {
    const snapshot = await this.collection(FGAS_COLLECTIONS.records).doc(id).get();
    if (!snapshot.exists)
      throw new AppException(ErrorCode.COMPLIANCE_RECORD_NOT_FOUND, 'F-Gas kaydı bulunamadı.');
    return { ...(snapshot.data() as FgasRecord), id: snapshot.id };
  }

  async create(dto: CreateFgasRecordDto): Promise<FgasRecord> {
    const now = new Date().toISOString();
    const ref = this.collection(FGAS_COLLECTIONS.records).doc();
    const record: FgasRecord = {
      id: ref.id,
      tenantId: this.tenant.getTenantId(),
      name: dto.name.trim(),
      location: dto.location.trim(),
      equipmentCode: dto.equipmentCode?.trim() ?? null,
      equipmentType: dto.equipmentType,
      manufacturer: dto.manufacturer?.trim() ?? null,
      model: dto.model?.trim() ?? null,
      serialNumber: dto.serialNumber?.trim() ?? null,
      refrigerant: dto.refrigerant?.trim() ?? null,
      refrigerantChargeKg: dto.refrigerantChargeKg ?? null,
      co2EquivalentTonnes: dto.co2EquivalentTonnes ?? null,
      hermeticallySealed: dto.hermeticallySealed ?? false,
      leakDetectionSystem: dto.leakDetectionSystem ?? false,
      installationDate: dto.installationDate ?? null,
      lastLeakCheckAt: dto.lastLeakCheckAt ?? null,
      nextLeakCheckDueAt: dto.nextLeakCheckDueAt ?? null,
      responsiblePerson: dto.responsiblePerson?.trim() ?? null,
      inspectionIntervalMonths: dto.inspectionIntervalMonths ?? null,
      notes: dto.notes?.trim() ?? null,
      status: dto.status ?? 'active',
      version: 1,
      createdAt: now,
      createdBy: this.tenant.getUserId(),
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: null,
      archivedBy: null,
    };
    await ref.set(record);
    await this.writeEvidence(record, FGAS_AUDIT_EVENTS.created);
    return record;
  }

  async update(id: string, dto: UpdateFgasRecordDto): Promise<FgasRecord> {
    const current = await this.get(id);
    if (current.archivedAt)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Arşivlenmiş F-Gas kaydı güncellenemez.',
      );
    if (current.version !== dto.expectedVersion)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Kayıt başka bir kullanıcı tarafından güncellendi.',
      );
    const now = new Date().toISOString();
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const record: FgasRecord = {
      ...current,
      ...changes,
      name: dto.name?.trim() ?? current.name,
      location: dto.location?.trim() ?? current.location,
      equipmentCode: dto.equipmentCode?.trim() ?? current.equipmentCode,
      manufacturer: dto.manufacturer?.trim() ?? current.manufacturer,
      model: dto.model?.trim() ?? current.model,
      serialNumber: dto.serialNumber?.trim() ?? current.serialNumber,
      refrigerant: dto.refrigerant?.trim() ?? current.refrigerant,
      responsiblePerson: dto.responsiblePerson?.trim() ?? current.responsiblePerson,
      notes: dto.notes?.trim() ?? current.notes,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
    };
    await this.collection(FGAS_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, FGAS_AUDIT_EVENTS.updated);
    return record;
  }

  archive(id: string): Promise<FgasRecord> {
    return this.setArchive(id, true);
  }
  restore(id: string): Promise<FgasRecord> {
    return this.setArchive(id, false);
  }

  async dashboard() {
    const [snapshot, operationsSnapshot] = await Promise.all([
      this.collection(FGAS_COLLECTIONS.records).get(),
      this.collection(FGAS_COLLECTIONS.operations).get(),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const active = snapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasRecord), id: doc.id }))
      .filter((item) => !item.archivedAt);
    const operations = operationsSnapshot.docs
      .map((doc) => doc.data() as FgasOperation)
      .filter((item) => !item.archivedAt);
    return {
      totalEquipment: active.length,
      activeEquipment: active.filter((item) => item.status === 'active').length,
      actionRequired: active.filter((item) => item.status === 'action-required').length,
      overdueLeakChecks: active.filter(
        (item) => item.nextLeakCheckDueAt && item.nextLeakCheckDueAt.slice(0, 10) < today,
      ).length,
      refrigerantChargeKg: active.reduce(
        (total, item) => total + (item.refrigerantChargeKg ?? 0),
        0,
      ),
      co2EquivalentTonnes: active.reduce(
        (total, item) => total + (item.co2EquivalentTonnes ?? 0),
        0,
      ),
      leakChecks: operations.filter((item) => item.kind === 'leak-check').length,
      pendingActions: operations.filter(
        (item) => item.status === 'action-required' || item.status === 'expired',
      ).length,
      certifiedTechnicians: operations.filter(
        (item) => item.kind === 'technician' && item.status !== 'expired',
      ).length,
      gasRecoveredKg: operations
        .filter((item) => item.kind === 'gas-movement' && item.movementType === 'recovery')
        .reduce((sum, item) => sum + (item.quantityKg ?? 0), 0),
    };
  }

  async allAudit(limit = 100) {
    const snapshot = await this.collection(FGAS_COLLECTIONS.audit).get();
    return snapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasAuditEntry), id: doc.id }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.min(limit, 200));
  }

  async completeOnboarding(dto: CompleteFgasOnboardingDto) {
    const tenantId = this.tenant.getTenantId();
    const now = new Date().toISOString();
    const profile = {
      ...dto,
      legalName: dto.legalName.trim(),
      primaryLocation: dto.primaryLocation.trim(),
      contactName: dto.contactName.trim(),
      contactEmail: dto.contactEmail.trim().toLowerCase(),
      taxNumber: dto.taxNumber?.trim() ?? null,
      contactPhone: dto.contactPhone?.trim() ?? null,
      completedAt: now,
      completedBy: this.tenant.getUserId(),
    };
    await this.firebase.db
      .doc(`tenants/${tenantId}`)
      .update({ onboardingCompleted: true, fgasProfile: profile, updatedAt: now });
    return { onboardingCompleted: true, profile };
  }

  async complianceReport(from?: string, to?: string) {
    const [equipmentSnapshot, operationSnapshot, audit] = await Promise.all([
      this.collection(FGAS_COLLECTIONS.records).get(),
      this.collection(FGAS_COLLECTIONS.operations).get(),
      this.allAudit(200),
    ]);
    const within = (date: string) =>
      (!from || date.slice(0, 10) >= from) && (!to || date.slice(0, 10) <= to);
    const equipment = equipmentSnapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasRecord), id: doc.id }))
      .filter((row) => !row.archivedAt);
    const operations = operationSnapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasOperation), id: doc.id }))
      .filter((row) => !row.archivedAt && within(row.occurredAt ?? row.createdAt));
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      tenantId: this.tenant.getTenantId(),
      period: { from: from ?? null, to: to ?? null },
      summary: {
        equipment: equipment.length,
        leakChecks: operations.filter((row) => row.kind === 'leak-check').length,
        gasMovements: operations.filter((row) => row.kind === 'gas-movement').length,
        technicians: operations.filter((row) => row.kind === 'technician').length,
        inspections: operations.filter((row) => row.kind === 'inspection').length,
        actionRequired: operations.filter(
          (row) => row.status === 'action-required' || row.status === 'expired',
        ).length,
      },
      equipment,
      operations,
      audit: audit.filter((row) => within(row.createdAt)),
    };
  }

  async audit(id: string) {
    await this.get(id);
    const snapshot = await this.collection(FGAS_COLLECTIONS.audit).get();
    return snapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasAuditEntry), id: doc.id }))
      .filter((entry) => entry.entityId === id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listOperations(kind: FgasOperationKind, query: FgasOperationListQueryDto) {
    const snapshot = await this.collection(FGAS_COLLECTIONS.operations).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs
      .map((doc) => ({ ...(doc.data() as FgasOperation), id: doc.id }))
      .filter((item) => item.kind === kind && Boolean(item.archivedAt) === query.archived)
      .filter((item) => !query.status || item.status === query.status)
      .filter(
        (item) =>
          !search ||
          `${item.title} ${item.reference ?? ''} ${item.location ?? ''} ${item.technicianName ?? ''}`
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

  async getOperation(kind: FgasOperationKind, id: string): Promise<FgasOperation> {
    const snapshot = await this.collection(FGAS_COLLECTIONS.operations).doc(id).get();
    const row = snapshot.exists ? { ...(snapshot.data() as FgasOperation), id: snapshot.id } : null;
    if (!row || row.kind !== kind)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_NOT_FOUND,
        'F-Gas operasyon kaydı bulunamadı.',
      );
    return row;
  }

  async createOperation(
    kind: FgasOperationKind,
    dto: CreateFgasOperationDto,
  ): Promise<FgasOperation> {
    const now = new Date().toISOString();
    const ref = this.collection(FGAS_COLLECTIONS.operations).doc();
    const text = (value?: string) => value?.trim() || null;
    const row: FgasOperation = {
      id: ref.id,
      tenantId: this.tenant.getTenantId(),
      kind,
      title: dto.title.trim(),
      reference: text(dto.reference),
      equipmentId: text(dto.equipmentId),
      location: text(dto.location),
      occurredAt: dto.occurredAt ?? null,
      dueAt: dto.dueAt ?? null,
      status: dto.status ?? 'draft',
      technicianId: text(dto.technicianId),
      technicianName: text(dto.technicianName),
      certificateNumber: text(dto.certificateNumber),
      certificateCategory: text(dto.certificateCategory),
      certificateExpiresAt: dto.certificateExpiresAt ?? null,
      refrigerant: text(dto.refrigerant),
      quantityKg: dto.quantityKg ?? null,
      movementType: dto.movementType ?? null,
      result: dto.result ?? null,
      leakDetected: dto.leakDetected ?? null,
      repairRequired: dto.repairRequired ?? null,
      followUpDueAt: dto.followUpDueAt ?? null,
      notes: text(dto.notes),
      evidenceRefs: dto.evidenceRefs ?? [],
      version: 1,
      createdAt: now,
      createdBy: this.tenant.getUserId(),
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: null,
      archivedBy: null,
    };
    this.assertOperationReady(row);
    await ref.set(row);
    await this.writeOperationEvidence(row, FGAS_AUDIT_EVENTS.operationCreated);
    return row;
  }

  async updateOperation(
    kind: FgasOperationKind,
    id: string,
    dto: UpdateFgasOperationDto,
  ): Promise<FgasOperation> {
    const current = await this.getOperation(kind, id);
    if (current.archivedAt)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Arşivlenmiş operasyon kaydı güncellenemez.',
      );
    if (current.version !== dto.expectedVersion)
      throw new AppException(
        ErrorCode.COMPLIANCE_RECORD_CONFLICT,
        'Kayıt başka bir kullanıcı tarafından güncellendi.',
      );
    const { expectedVersion: _version, ...changes } = dto;
    const now = new Date().toISOString();
    const row = {
      ...current,
      ...changes,
      title: dto.title?.trim() ?? current.title,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
    } as FgasOperation;
    this.assertOperationReady(row);
    await this.collection(FGAS_COLLECTIONS.operations).doc(id).set(row);
    await this.writeOperationEvidence(row, FGAS_AUDIT_EVENTS.operationUpdated);
    return row;
  }

  async setOperationArchive(
    kind: FgasOperationKind,
    id: string,
    archived: boolean,
  ): Promise<FgasOperation> {
    const current = await this.getOperation(kind, id);
    const now = new Date().toISOString();
    const row = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: archived ? now : null,
      archivedBy: archived ? this.tenant.getUserId() : null,
    };
    await this.collection(FGAS_COLLECTIONS.operations).doc(id).set(row);
    await this.writeOperationEvidence(
      row,
      archived ? FGAS_AUDIT_EVENTS.operationArchived : FGAS_AUDIT_EVENTS.operationRestored,
    );
    return row;
  }

  private async writeOperationEvidence(row: FgasOperation, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(FGAS_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(FGAS_COLLECTIONS.audit).doc();
    await snapshotRef.set({
      id: snapshotRef.id,
      recordId: row.id,
      recordVersion: row.version,
      payload: row,
      createdAt: now,
      createdBy: this.tenant.getUserId(),
      immutable: true,
    });
    await auditRef.set({
      id: auditRef.id,
      event,
      entity: 'fgasOperation',
      entityId: row.id,
      version: row.version,
      actorId: this.tenant.getUserId(),
      createdAt: now,
    });
  }

  private assertOperationReady(row: FgasOperation): void {
    if (row.status !== 'completed') return;
    const fields: string[] = [];
    const require = (value: unknown, label: string) => {
      if (!value) fields.push(label);
    };
    require(row.occurredAt, 'işlem tarihi');
    if (row.kind === 'leak-check') {
      require(row.equipmentId, 'ekipman');
      require(row.technicianName, 'teknisyen');
      require(row.result, 'kontrol sonucu');
    }
    if (row.kind === 'gas-movement') {
      require(row.equipmentId, 'ekipman');
      require(row.refrigerant, 'soğutucu akışkan');
      require(row.quantityKg && row.quantityKg > 0, 'miktar');
      require(row.movementType, 'hareket türü');
    }
    if (row.kind === 'technician') {
      require(row.certificateNumber, 'sertifika numarası');
      require(row.certificateCategory, 'sertifika kategorisi');
      require(row.certificateExpiresAt, 'sertifika geçerlilik tarihi');
    }
    if (row.kind === 'inspection') {
      require(row.result, 'denetim sonucu');
      require(row.reference, 'rapor referansı');
    }
    if (fields.length)
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        `Tamamlanan kayıt için zorunlu alanlar eksik: ${fields.join(', ')}.`,
      );
  }

  private async setArchive(id: string, archived: boolean): Promise<FgasRecord> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const record: FgasRecord = {
      ...current,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: this.tenant.getUserId(),
      archivedAt: archived ? now : null,
      archivedBy: archived ? this.tenant.getUserId() : null,
    };
    await this.collection(FGAS_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(
      record,
      archived ? FGAS_AUDIT_EVENTS.archived : FGAS_AUDIT_EVENTS.restored,
    );
    return record;
  }

  private async writeEvidence(record: FgasRecord, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(FGAS_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(FGAS_COLLECTIONS.audit).doc();
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
      entity: 'fgasRecord',
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

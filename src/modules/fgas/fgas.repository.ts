import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { CreateFgasRecordDto, FgasListQueryDto, UpdateFgasRecordDto } from './fgas.dto';
import { FGAS_AUDIT_EVENTS, FGAS_COLLECTIONS } from './fgas.constants';
import { FgasRecord } from './fgas.types';

@Injectable()
export class FgasRepository {
  constructor(private readonly firebase: FirebaseService, private readonly tenant: TenantContext) {}

  async list(query: FgasListQueryDto) {
    const snapshot = await this.collection(FGAS_COLLECTIONS.records).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs.map(doc => ({ ...(doc.data() as FgasRecord), id: doc.id }))
      .filter(item => Boolean(item.archivedAt) === query.archived)
      .filter(item => !search || `${item.name} ${item.location} ${item.equipmentCode ?? ''}`.toLocaleLowerCase('tr-TR').includes(search))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) || 0 : 0;
    const items = rows.slice(start, start + query.limit);
    return { items, nextCursor: start + query.limit < rows.length ? Buffer.from(String(start + query.limit)).toString('base64url') : null };
  }

  async get(id: string): Promise<FgasRecord> {
    const snapshot = await this.collection(FGAS_COLLECTIONS.records).doc(id).get();
    if (!snapshot.exists) throw new AppException(ErrorCode.COMPLIANCE_RECORD_NOT_FOUND, 'F-Gas kaydı bulunamadı.');
    return { ...(snapshot.data() as FgasRecord), id: snapshot.id };
  }

  async create(dto: CreateFgasRecordDto): Promise<FgasRecord> {
    const now = new Date().toISOString();
    const ref = this.collection(FGAS_COLLECTIONS.records).doc();
    const record: FgasRecord = { id: ref.id, tenantId: this.tenant.getTenantId(), name: dto.name.trim(), location: dto.location.trim(), equipmentCode: dto.equipmentCode?.trim() ?? null, refrigerant: dto.refrigerant?.trim() ?? null, status: dto.status ?? 'pending', version: 1, createdAt: now, createdBy: this.tenant.getUserId(), updatedAt: now, updatedBy: this.tenant.getUserId(), archivedAt: null, archivedBy: null };
    await ref.set(record);
    await this.writeEvidence(record, FGAS_AUDIT_EVENTS.created);
    return record;
  }

  async update(id: string, dto: UpdateFgasRecordDto): Promise<FgasRecord> {
    const current = await this.get(id);
    if (current.archivedAt) throw new AppException(ErrorCode.COMPLIANCE_RECORD_CONFLICT, 'Arşivlenmiş F-Gas kaydı güncellenemez.');
    if (current.version !== dto.expectedVersion) throw new AppException(ErrorCode.COMPLIANCE_RECORD_CONFLICT, 'Kayıt başka bir kullanıcı tarafından güncellendi.');
    const now = new Date().toISOString();
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const record: FgasRecord = { ...current, ...changes, name: dto.name?.trim() ?? current.name, location: dto.location?.trim() ?? current.location, equipmentCode: dto.equipmentCode?.trim() ?? current.equipmentCode, refrigerant: dto.refrigerant?.trim() ?? current.refrigerant, version: current.version + 1, updatedAt: now, updatedBy: this.tenant.getUserId() };
    await this.collection(FGAS_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, FGAS_AUDIT_EVENTS.updated);
    return record;
  }

  archive(id: string): Promise<FgasRecord> { return this.setArchive(id, true); }
  restore(id: string): Promise<FgasRecord> { return this.setArchive(id, false); }

  private async setArchive(id: string, archived: boolean): Promise<FgasRecord> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const record: FgasRecord = { ...current, version: current.version + 1, updatedAt: now, updatedBy: this.tenant.getUserId(), archivedAt: archived ? now : null, archivedBy: archived ? this.tenant.getUserId() : null };
    await this.collection(FGAS_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, archived ? FGAS_AUDIT_EVENTS.archived : FGAS_AUDIT_EVENTS.restored);
    return record;
  }

  private async writeEvidence(record: FgasRecord, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(FGAS_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(FGAS_COLLECTIONS.audit).doc();
    await snapshotRef.set({ id: snapshotRef.id, recordId: record.id, recordVersion: record.version, payload: record, createdAt: now, createdBy: this.tenant.getUserId(), immutable: true });
    await auditRef.set({ id: auditRef.id, event, entity: 'fgasRecord', entityId: record.id, version: record.version, actorId: this.tenant.getUserId(), createdAt: now });
  }

  private collection(name: string) { return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), name)); }
}

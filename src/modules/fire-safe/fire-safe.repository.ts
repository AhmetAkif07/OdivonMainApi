import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { tenantCollectionPath } from '../../shared/firebase/firestore-path';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import { CreateFireSafeRecordDto, FireSafeListQueryDto, UpdateFireSafeRecordDto } from './fire-safe.dto';
import { FIRE_SAFE_AUDIT_EVENTS, FIRE_SAFE_COLLECTIONS } from './fire-safe.constants';
import { FireSafeRecord } from './fire-safe.types';

@Injectable()
export class FireSafeRepository {
  constructor(private readonly firebase: FirebaseService, private readonly tenant: TenantContext) {}

  async list(query: FireSafeListQueryDto) {
    const snapshot = await this.collection(FIRE_SAFE_COLLECTIONS.records).get();
    const search = query.search?.trim().toLocaleLowerCase('tr-TR');
    const rows = snapshot.docs.map(doc => ({ ...(doc.data() as FireSafeRecord), id: doc.id }))
      .filter(item => Boolean(item.archivedAt) === query.archived)
      .filter(item => !search || `${item.name} ${item.location} ${item.facilityCode ?? ''}`.toLocaleLowerCase('tr-TR').includes(search))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const start = query.cursor ? Number(Buffer.from(query.cursor, 'base64url').toString('utf8')) || 0 : 0;
    const items = rows.slice(start, start + query.limit);
    return { items, nextCursor: start + query.limit < rows.length ? Buffer.from(String(start + query.limit)).toString('base64url') : null };
  }

  async get(id: string): Promise<FireSafeRecord> {
    const snapshot = await this.collection(FIRE_SAFE_COLLECTIONS.records).doc(id).get();
    if (!snapshot.exists) throw new AppException(ErrorCode.COMPLIANCE_RECORD_NOT_FOUND, 'Yangın güvenliği kaydı bulunamadı.');
    return { ...(snapshot.data() as FireSafeRecord), id: snapshot.id };
  }

  async create(dto: CreateFireSafeRecordDto): Promise<FireSafeRecord> {
    const now = new Date().toISOString();
    const ref = this.collection(FIRE_SAFE_COLLECTIONS.records).doc();
    const record: FireSafeRecord = { id: ref.id, tenantId: this.tenant.getTenantId(), name: dto.name.trim(), location: dto.location.trim(), facilityCode: dto.facilityCode?.trim() ?? null, inspectionDueAt: dto.inspectionDueAt?.trim() ?? null, status: dto.status ?? 'pending', version: 1, createdAt: now, createdBy: this.tenant.getUserId(), updatedAt: now, updatedBy: this.tenant.getUserId(), archivedAt: null, archivedBy: null };
    await ref.set(record);
    await this.writeEvidence(record, FIRE_SAFE_AUDIT_EVENTS.created);
    return record;
  }

  async update(id: string, dto: UpdateFireSafeRecordDto): Promise<FireSafeRecord> {
    const current = await this.get(id);
    if (current.archivedAt) throw new AppException(ErrorCode.COMPLIANCE_RECORD_CONFLICT, 'Arşivlenmiş Yangın güvenliği kaydı güncellenemez.');
    if (current.version !== dto.expectedVersion) throw new AppException(ErrorCode.COMPLIANCE_RECORD_CONFLICT, 'Kayıt başka bir kullanıcı tarafından güncellendi.');
    const now = new Date().toISOString();
    const { expectedVersion: _expectedVersion, ...changes } = dto;
    const record: FireSafeRecord = { ...current, ...changes, name: dto.name?.trim() ?? current.name, location: dto.location?.trim() ?? current.location, facilityCode: dto.facilityCode?.trim() ?? current.facilityCode, inspectionDueAt: dto.inspectionDueAt?.trim() ?? current.inspectionDueAt, version: current.version + 1, updatedAt: now, updatedBy: this.tenant.getUserId() };
    await this.collection(FIRE_SAFE_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, FIRE_SAFE_AUDIT_EVENTS.updated);
    return record;
  }

  archive(id: string): Promise<FireSafeRecord> { return this.setArchive(id, true); }
  restore(id: string): Promise<FireSafeRecord> { return this.setArchive(id, false); }

  private async setArchive(id: string, archived: boolean): Promise<FireSafeRecord> {
    const current = await this.get(id);
    const now = new Date().toISOString();
    const record: FireSafeRecord = { ...current, version: current.version + 1, updatedAt: now, updatedBy: this.tenant.getUserId(), archivedAt: archived ? now : null, archivedBy: archived ? this.tenant.getUserId() : null };
    await this.collection(FIRE_SAFE_COLLECTIONS.records).doc(id).set(record);
    await this.writeEvidence(record, archived ? FIRE_SAFE_AUDIT_EVENTS.archived : FIRE_SAFE_AUDIT_EVENTS.restored);
    return record;
  }

  private async writeEvidence(record: FireSafeRecord, event: string): Promise<void> {
    const now = new Date().toISOString();
    const snapshotRef = this.collection(FIRE_SAFE_COLLECTIONS.snapshots).doc();
    const auditRef = this.collection(FIRE_SAFE_COLLECTIONS.audit).doc();
    await snapshotRef.set({ id: snapshotRef.id, recordId: record.id, recordVersion: record.version, payload: record, createdAt: now, createdBy: this.tenant.getUserId(), immutable: true });
    await auditRef.set({ id: auditRef.id, event, entity: 'fireSafeRecord', entityId: record.id, version: record.version, actorId: this.tenant.getUserId(), createdAt: now });
  }

  private collection(name: string) { return this.firebase.db.collection(tenantCollectionPath(this.tenant.getTenantId(), name)); }
}

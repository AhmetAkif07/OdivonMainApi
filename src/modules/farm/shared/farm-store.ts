import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { createBaseFields, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { PROTECTED_FIELDS } from './farm-collections';
import { farmForbidden, farmInvalid, farmNotFound } from './farm-errors';
import { canWriteFarmData, FarmRole, isFarmRole } from './farm-roles';

export type FarmDoc = Record<string, unknown> & { id: string };

export interface FarmListOptions {
  /** `true` lists the recycle bin (soft-deleted rows) instead of the active rows. */
  deleted?: boolean;
  /** Equality filters, applied in memory so no composite index is needed. */
  equals?: Record<string, string>;
}

/** Firestore batches take at most 500 writes. */
export const FARM_BATCH_LIMIT = 500;

const NO_ACCESS = 'Bu çiftliğe erişim yetkiniz yok.';
const READ_ONLY = 'Salt okunur rolünüz bu işlemi yapmanıza izin vermiyor.';
const ADMIN_ONLY = 'Bu işlem yalnızca çiftlik yöneticisi (Admin) tarafından yapılabilir.';

/** Tenant-scoped Firestore access for the farm module (`tenants/{tenantId}/farm*`). */
@Injectable()
export class FarmStore {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  get db() {
    return this.firebase.db;
  }

  get auth() {
    return this.firebase.auth;
  }

  tenantId(): string {
    return this.tenantContext.getTenantId();
  }

  userId(): string {
    return this.tenantContext.getUserId();
  }

  isOwner(): boolean {
    return this.tenantContext.getStore().role === 'owner';
  }

  collection(name: string) {
    return this.db.collection(tenantCollectionPath(this.tenantId(), name));
  }

  doc(name: string, id: string) {
    return this.collection(name).doc(id);
  }

  /** The caller's farm role: the owner is always admin, others need an active member card. */
  async currentRole(): Promise<FarmRole | null> {
    if (this.isOwner()) return 'admin';
    const snapshot = await this.doc(TENANT_COLLECTION.farmMembers, this.userId()).get();
    const member = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
    if (!member || member['deletedAt'] || member['status'] === 'passive') return null;
    return isFarmRole(member['role']) ? member['role'] : null;
  }

  async requireRole(): Promise<FarmRole> {
    const role = await this.currentRole();
    if (!role) throw farmForbidden(NO_ACCESS);
    return role;
  }

  async assertCanWrite(): Promise<FarmRole> {
    const role = await this.requireRole();
    if (!canWriteFarmData(role)) throw farmForbidden(READ_ONLY);
    return role;
  }

  async assertAdmin(): Promise<void> {
    if ((await this.requireRole()) !== 'admin') throw farmForbidden(ADMIN_ONLY);
  }

  async list(name: string, options: FarmListOptions = {}): Promise<FarmDoc[]> {
    const query = options.deleted
      ? this.collection(name).where('deletedAt', '!=', null)
      : this.collection(name).where('deletedAt', '==', null);
    const snapshot = await query.get();
    const equals = Object.entries(options.equals ?? {});
    return snapshot.docs
      .map((doc) => toPlain({ ...doc.data(), id: doc.id }) as FarmDoc)
      .filter((item) => equals.every(([key, value]) => String(item[key]) === value));
  }

  /** Returns soft-deleted rows too, like the client's former `docData` listener did. */
  async find(name: string, id: string): Promise<FarmDoc | null> {
    const snapshot = await this.doc(name, id).get();
    return snapshot.exists ? (toPlain({ ...snapshot.data(), id: snapshot.id }) as FarmDoc) : null;
  }

  async getOrThrow(name: string, id: string, message = 'Kayıt bulunamadı.'): Promise<FarmDoc> {
    const item = await this.find(name, id);
    if (!item) throw farmNotFound(message);
    return item;
  }

  async create(name: string, fields: Record<string, unknown>, id?: string): Promise<FarmDoc> {
    const ref = id ? this.doc(name, id) : this.collection(name).doc();
    const item = this.newDoc(ref.id, fields);
    await ref.set(item);
    return item;
  }

  async createMany(name: string, items: Record<string, unknown>[]): Promise<FarmDoc[]> {
    const batch = this.db.batch();
    const created = items.map((fields) => {
      const ref = this.collection(name).doc();
      const item = this.newDoc(ref.id, fields);
      batch.set(ref, item);
      return item;
    });
    if (created.length > 0) await batch.commit();
    return created;
  }

  /** Shallow update (like the client's `updateDoc`); nested maps are replaced, not merged. */
  async update(name: string, id: string, fields: Record<string, unknown>): Promise<FarmDoc> {
    await this.getOrThrow(name, id);
    await this.doc(name, id).update({ ...fields, ...touchBaseFields(this.userId()) });
    return this.getOrThrow(name, id);
  }

  async softDelete(name: string, id: string): Promise<{ id: string }> {
    await this.getOrThrow(name, id);
    await this.doc(name, id).update(this.deletionFields());
    return { id };
  }

  async softDeleteMany(name: string, ids: string[]): Promise<{ deleted: number }> {
    const refs = ids.map((id) => this.doc(name, id));
    const snapshots = refs.length > 0 ? await this.db.getAll(...refs) : [];
    const batch = this.db.batch();
    const existing = snapshots.filter((snapshot) => snapshot.exists);
    existing.forEach((snapshot) => batch.update(snapshot.ref, this.deletionFields()));
    if (existing.length > 0) await batch.commit();
    return { deleted: existing.length };
  }

  async restore(name: string, id: string): Promise<FarmDoc> {
    await this.getOrThrow(name, id);
    await this.doc(name, id).update({
      deletedAt: null,
      deletedBy: null,
      ...touchBaseFields(this.userId()),
    });
    return this.getOrThrow(name, id);
  }

  async hardDelete(name: string, id: string): Promise<{ id: string }> {
    await this.getOrThrow(name, id);
    await this.doc(name, id).delete();
    return { id };
  }

  private newDoc(id: string, fields: Record<string, unknown>): FarmDoc {
    return {
      ...fields,
      ...createBaseFields(id, this.userId()),
      farmId: this.tenantId(),
      deletedBy: null,
    };
  }

  private deletionFields() {
    const now = new Date().toISOString();
    return { deletedAt: now, deletedBy: this.userId(), ...touchBaseFields(this.userId(), now) };
  }
}

/**
 * Validates a free-form client document: a plain JSON object without server-owned fields.
 * Keys with dots would be read as field paths by Firestore `update`, so they are rejected.
 */
export function sanitizeFarmFields(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw farmInvalid('Geçersiz kayıt verisi.');
  }
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (PROTECTED_FIELDS.has(key) || value === undefined) continue;
    if (!key || key.includes('.') || key.startsWith('__')) {
      throw farmInvalid(`Geçersiz alan adı: ${key}`);
    }
    fields[key] = value;
  }
  return fields;
}

/** Converts Firestore Timestamps (legacy/migrated data) to ISO strings for JSON responses. */
export function toPlain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toPlain);
  if (value && typeof value === 'object') {
    const candidate = value as { toDate?: () => Date };
    if (typeof candidate.toDate === 'function') return candidate.toDate().toISOString();
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toPlain(item)]),
    );
  }
  return value;
}

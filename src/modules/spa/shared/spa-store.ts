import { Injectable, Logger } from '@nestjs/common';
import { Query, Transaction } from 'firebase-admin/firestore';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import {
  BaseDocument,
  createBaseFields,
  isDeleted,
  omitUndefined,
  touchBaseFields,
} from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { spaNotFound } from './spa-errors';
import { isSpaStaffRole, SpaStaffRole } from './spa-roles';
import { DEFAULT_TIMEZONE, TenantSchedule } from './spa-time';

export type SpaDoc = BaseDocument & Record<string, unknown>;

export type SpaAuditAction = 'create' | 'update' | 'delete' | 'callable';

export interface SpaListOptions {
  /** Field the `from`/`to` window applies to (ISO strings or YYYY-MM-DD compare lexicographically). */
  dateField?: string;
  from?: string;
  to?: string;
  equals?: Record<string, string | boolean | undefined>;
  orderBy: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
}

export interface SpaSettingsDoc extends BaseDocument {
  timezone: string;
  currency: string;
  workDayStart: string;
  workDayEnd: string;
}

export const DEFAULT_SPA_SETTINGS = {
  timezone: DEFAULT_TIMEZONE,
  currency: 'TRY',
  workDayStart: '09:00',
  workDayEnd: '21:00',
};

/** Tenant-scoped Firestore access for the spa module (`tenants/{tenantId}/spa*`), with audit trail. */
@Injectable()
export class SpaStore {
  private readonly logger = new Logger(SpaStore.name);

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

  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(fn);
  }

  /**
   * Firestore only receives filters that need no composite index (one range, or equalities);
   * the rest — deleted rows, extra filters, ordering — is applied in memory.
   */
  async list<T extends SpaDoc>(name: string, options: SpaListOptions): Promise<T[]> {
    const equals = Object.entries(options.equals ?? {}).filter(([, value]) => value !== undefined);
    const hasRange = Boolean(options.dateField && (options.from || options.to));
    let query: Query = this.collection(name);

    if (hasRange) {
      const field = options.dateField!;
      if (options.from) query = query.where(field, '>=', options.from);
      if (options.to) query = query.where(field, '<', options.to);
      query = query.orderBy(field, options.orderBy.field === field ? options.orderBy.dir : 'asc');
    } else if (equals.length > 0) {
      for (const [field, value] of equals) query = query.where(field, '==', value);
    } else {
      query = query.orderBy(options.orderBy.field, options.orderBy.dir);
      if (options.limit) query = query.limit(options.limit);
    }

    const snapshot = await query.get();
    const { field, dir } = options.orderBy;
    const sign = dir === 'asc' ? 1 : -1;
    const items = snapshot.docs
      .map((doc) => ({ ...(doc.data() as T), id: doc.id }))
      .filter((item) => !isDeleted(item))
      .filter((item) => equals.every(([key, value]) => item[key] === value))
      .sort((left, right) => sign * compareValues(left[field], right[field]));
    return options.limit ? items.slice(0, options.limit) : items;
  }

  async find<T extends SpaDoc>(name: string, id: string): Promise<T | null> {
    const snapshot = await this.doc(name, id).get();
    const item = snapshot.exists ? ({ ...(snapshot.data() as T), id: snapshot.id } as T) : null;
    return item && !isDeleted(item) ? item : null;
  }

  async getOrThrow<T extends SpaDoc>(name: string, id: string, message: string): Promise<T> {
    const item = await this.find<T>(name, id);
    if (!item) throw spaNotFound(message);
    return item;
  }

  /** Creates a document (optionally with a fixed id) and writes the matching audit entry. */
  async create<T extends SpaDoc>(
    name: string,
    entity: string,
    fields: object,
    id?: string,
  ): Promise<T> {
    const ref = id ? this.doc(name, id) : this.collection(name).doc();
    const item = {
      ...createBaseFields(ref.id, this.userId()),
      ...omitUndefined(fields as Record<string, unknown>),
    } as unknown as T;
    await ref.set(item);
    await this.audit(entity, 'create', ref.id, null, fields as Record<string, unknown>);
    return item;
  }

  async update<T extends SpaDoc>(
    name: string,
    entity: string,
    id: string,
    patch: object,
    notFoundMessage: string,
  ): Promise<T> {
    const current = await this.getOrThrow<T>(name, id, notFoundMessage);
    const changes = omitUndefined(patch as Record<string, unknown>);
    const updated = { ...current, ...changes, ...touchBaseFields(this.userId()) } as T;
    await this.doc(name, id).set(updated);
    await this.audit(entity, 'update', id, pick(current, Object.keys(changes)), changes);
    return updated;
  }

  async softDelete(name: string, entity: string, id: string, notFoundMessage: string) {
    const current = await this.getOrThrow(name, id, notFoundMessage);
    await this.doc(name, id).update({
      deletedAt: new Date().toISOString(),
      ...touchBaseFields(this.userId()),
    });
    await this.audit(entity, 'delete', id, current, null);
    return { id };
  }

  /** Audit entries keep the SPA's shape (`entity`, `before`, `after`) so its audit screen keeps working. */
  async audit(
    entity: string,
    action: SpaAuditAction,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      const store = this.tenantContext.getStore();
      const ref = this.collection(TENANT_COLLECTION.spaAuditLogs).doc();
      await ref.set({
        id: ref.id,
        entity,
        action,
        entityId,
        before: before ? stripUndefinedDeep(before) : null,
        after: after ? stripUndefinedDeep(after) : null,
        userId: store.userId,
        userEmail: store.email,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error(`Failed to write spa audit log for ${entity}/${entityId}`, error as Error);
    }
  }

  async settings(): Promise<SpaSettingsDoc> {
    const snapshot = await this.doc(TENANT_COLLECTION.spaSettings, this.tenantId()).get();
    const stored = snapshot.exists ? (snapshot.data() as Partial<SpaSettingsDoc>) : {};
    return {
      ...createBaseFields(this.tenantId(), this.userId()),
      ...DEFAULT_SPA_SETTINGS,
      ...stored,
      id: this.tenantId(),
    } as SpaSettingsDoc;
  }

  async schedule(): Promise<TenantSchedule> {
    const settings = await this.settings();
    return {
      timeZone: settings.timezone || DEFAULT_TIMEZONE,
      workDayStart: settings.workDayStart,
      workDayEnd: settings.workDayEnd,
    };
  }

  async timeZone(): Promise<string> {
    return (await this.schedule()).timeZone;
  }

  /** The caller's spa role: the tenant owner always acts as admin. */
  async currentRole(): Promise<SpaStaffRole | null> {
    if (this.isOwner()) return 'admin';
    const staff = await this.find(TENANT_COLLECTION.spaStaff, this.userId());
    const role = staff?.['role'];
    return staff && staff['active'] !== false && isSpaStaffRole(role) ? role : null;
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (left === right) return 0;
  if (left === undefined || left === null) return 1;
  if (right === undefined || right === null) return -1;
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right), 'tr');
}

function pick(source: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]));
}

/** Firestore rejects `undefined`; audit snapshots may contain it in nested DTO objects. */
function stripUndefinedDeep(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

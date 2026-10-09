import { Injectable, Logger } from '@nestjs/common';
import { DocumentReference, Query, Transaction } from 'firebase-admin/firestore';
import { PermissionResource } from '../../../shared/authorization/permissions';
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
import { hairForbidden, hairNotFound } from './hair-errors';
import { HAIR_DEFAULT_LIST_LIMIT, HairPage } from './hair-list.dto';
import { HairScope, HairStaffRole, isHairStaffRole, scopeFor } from './hair-roles';
import { DEFAULT_TIMEZONE, TenantSchedule } from './hair-time';

export type HairDoc = BaseDocument & Record<string, unknown>;

export type HairAuditAction = 'create' | 'update' | 'delete' | 'callable';

export interface HairListOptions {
  /** Field the `from`/`to` window applies to (ISO strings or YYYY-MM-DD compare lexicographically). */
  dateField?: string;
  from?: string;
  to?: string;
  equals?: Record<string, string | boolean | undefined>;
  /** Restrict rows to those whose `field` is one of `values` (branch scoping). */
  anyOf?: { field: string; values: string[] };
  /** Extra in-memory predicate (free-text search, own-row scoping on nested fields). */
  match?: (item: HairDoc) => boolean;
  orderBy: { field: string; dir: 'asc' | 'desc' };
  limit?: number;
  cursor?: string;
}

/** Branch filter for a list: one branch (after an access check) or every branch the caller works in. */
export interface HairBranchFilter {
  equals?: string;
  anyOf?: string[];
}

export interface HairSettingsDoc extends BaseDocument {
  timezone: string;
  currency: string;
  workDayStart: string;
  workDayEnd: string;
  onlineBookingEnabled: boolean;
  autoConfirmOnlineBooking: boolean;
  reminderHoursBefore: number;
  cancellationHoursBefore: number;
  noShowPolicy: string;
  whatsappEnabled: boolean;
  birthdayMessageEnabled: boolean;
  reengagementDays: number;
  /** Only a status flag: provider secrets never live in Firestore (plan §5.12). */
  smsConfigured: boolean;
  emailConfigured: boolean;
}

export const DEFAULT_HAIR_SETTINGS = {
  timezone: DEFAULT_TIMEZONE,
  currency: 'TRY',
  workDayStart: '09:00',
  workDayEnd: '21:00',
  onlineBookingEnabled: false,
  autoConfirmOnlineBooking: false,
  reminderHoursBefore: 24,
  cancellationHoursBefore: 2,
  noShowPolicy: '',
  whatsappEnabled: false,
  birthdayMessageEnabled: false,
  reengagementDays: 30,
  smsConfigured: false,
  emailConfigured: false,
};

/** The caller as the hair module sees them. */
export interface HairActor {
  userId: string;
  role: HairStaffRole;
  /** `hairStaff` doc id of the caller; undefined for an owner without a staff card. */
  staffId?: string;
  /** `null` = every branch (owner/admin); otherwise the branches the caller works in. */
  branchIds: string[] | null;
}

/** Tenant-scoped Firestore access for the hair module (`tenants/{tenantId}/hair*`), with audit trail. */
@Injectable()
export class HairStore {
  private readonly logger = new Logger(HairStore.name);

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

  /** Reference helpers for transactional writes (the caller must use `tx.set/update`, never `store.create`). */
  ref(name: string, id: string): DocumentReference {
    return this.doc(name, id);
  }

  newRef(name: string): DocumentReference {
    return this.collection(name).doc();
  }

  /** Base fields (id, audit stamps) for a document written inside a transaction. */
  stamp(ref: DocumentReference, fields: object): HairDoc {
    return {
      ...createBaseFields(ref.id, this.userId()),
      ...omitUndefined(fields as Record<string, unknown>),
    };
  }

  runTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.db.runTransaction(fn);
  }

  /**
   * Firestore only receives filters that need no composite index (one range, or equalities);
   * the rest — deleted rows, extra filters, ordering, paging — is applied in memory.
   */
  async list<T extends HairDoc>(name: string, options: HairListOptions): Promise<HairPage<T>> {
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
    }

    const snapshot = await query.get();
    const { field, dir } = options.orderBy;
    const sign = dir === 'asc' ? 1 : -1;
    const anyOf = options.anyOf;
    const sorted = snapshot.docs
      .map((doc) => ({ ...(doc.data() as T), id: doc.id }))
      .filter((item) => !isDeleted(item))
      .filter((item) => equals.every(([key, value]) => item[key] === value))
      .filter((item) => !anyOf || anyOf.values.includes(String(item[anyOf.field])))
      .filter((item) => !options.match || options.match(item))
      .sort(
        (left, right) =>
          sign * compareValues(left[field], right[field]) || left.id.localeCompare(right.id),
      );

    const limit = options.limit ?? HAIR_DEFAULT_LIST_LIMIT;
    const start = options.cursor ? afterCursor(sorted, options.cursor) : 0;
    const items = sorted.slice(start, start + limit);
    const hasMore = start + limit < sorted.length;
    return { items, nextCursor: hasMore ? encodeCursor(items[items.length - 1].id) : null };
  }

  /**
   * Every live row of a collection, optionally narrowed by ONE Firestore filter (no composite
   * index needed); callers filter the rest in memory. For internal reads (reports, checks), not paging.
   */
  async rows<T extends HairDoc>(
    name: string,
    filter?: { field: string; op: '==' | '>=' | '<' | 'in'; value: unknown },
    range?: { field: string; from?: string; to?: string },
  ): Promise<T[]> {
    let query: Query = this.collection(name);
    if (filter) query = query.where(filter.field, filter.op, filter.value);
    if (range?.from) query = query.where(range.field, '>=', range.from);
    if (range?.to) query = query.where(range.field, '<', range.to);
    const snapshot = await query.get();
    return snapshot.docs
      .map((doc) => ({ ...(doc.data() as T), id: doc.id }))
      .filter((item) => !isDeleted(item));
  }

  async find<T extends HairDoc>(name: string, id: string): Promise<T | null> {
    const snapshot = await this.doc(name, id).get();
    const item = snapshot.exists ? ({ ...(snapshot.data() as T), id: snapshot.id } as T) : null;
    return item && !isDeleted(item) ? item : null;
  }

  async getOrThrow<T extends HairDoc>(name: string, id: string, message: string): Promise<T> {
    const item = await this.find<T>(name, id);
    if (!item) throw hairNotFound(message);
    return item;
  }

  /** Creates a document (optionally with a fixed id) and writes the matching audit entry. */
  async create<T extends HairDoc>(
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

  async update<T extends HairDoc>(
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

  async audit(
    entity: string,
    action: HairAuditAction,
    entityId: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      const store = this.tenantContext.getStore();
      const ref = this.collection(TENANT_COLLECTION.hairAuditLogs).doc();
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
      this.logger.error(`Failed to write hair audit log for ${entity}/${entityId}`, error as Error);
    }
  }

  async settings(): Promise<HairSettingsDoc> {
    const snapshot = await this.doc(TENANT_COLLECTION.hairSettings, this.tenantId()).get();
    const stored = snapshot.exists ? (snapshot.data() as Partial<HairSettingsDoc>) : {};
    return {
      ...createBaseFields(this.tenantId(), this.userId()),
      ...DEFAULT_HAIR_SETTINGS,
      ...stored,
      id: this.tenantId(),
    } as HairSettingsDoc;
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

  /**
   * The caller's hair identity. The tenant owner always acts as admin on every branch; everyone
   * else needs an active `hairStaff` card (matched by `userId`) with a known role.
   */
  async actor(): Promise<HairActor | null> {
    const userId = this.userId();
    if (this.isOwner()) {
      const card = await this.staffCard(userId);
      return { userId, role: 'admin', staffId: card?.id, branchIds: null };
    }
    const card = await this.staffCard(userId);
    const role = card?.['role'];
    if (!card || card['active'] === false || !isHairStaffRole(role)) return null;
    const branchIds = Array.isArray(card['branchIds']) ? (card['branchIds'] as string[]) : [];
    return {
      userId,
      role,
      staffId: card.id,
      branchIds: role === 'admin' ? null : branchIds,
    };
  }

  async actorOrThrow(): Promise<HairActor> {
    const actor = await this.actor();
    if (!actor) throw hairForbidden('Bu işletmede aktif bir personel kaydınız yok.');
    return actor;
  }

  /** Throws unless the caller works in `branchId` (owner/admin always pass). */
  assertBranchAccess(actor: HairActor, branchId: string | undefined | null): void {
    if (actor.branchIds === null || !branchId) return;
    if (!actor.branchIds.includes(branchId)) {
      throw hairForbidden('Bu şubeye erişim yetkiniz yok.');
    }
  }

  /** How far `resource` reaches for the caller (`own` rows, `limited` fields, or `all`). */
  scope(actor: HairActor, resource: PermissionResource): HairScope {
    return scopeFor(actor.role, resource);
  }

  /** List filter for `branchId`: checks access to a requested branch, else limits to the caller's. */
  branchFilter(actor: HairActor, branchId: string | undefined): HairBranchFilter {
    if (branchId) {
      this.assertBranchAccess(actor, branchId);
      return { equals: branchId };
    }
    return actor.branchIds === null ? {} : { anyOf: actor.branchIds };
  }

  /**
   * Staff id a list must be limited to: the caller's own id when their scope on `resource` is `own`
   * (a request for someone else's rows is refused), otherwise the requested filter as-is.
   */
  staffFilter(
    actor: HairActor,
    resource: PermissionResource,
    requested: string | undefined,
  ): string | undefined {
    if (this.scope(actor, resource) !== 'own') return requested;
    if (!actor.staffId) throw hairForbidden('Personel kartınız bulunamadı.');
    if (requested && requested !== actor.staffId) {
      throw hairForbidden('Yalnızca kendi kayıtlarınızı görebilirsiniz.');
    }
    return actor.staffId;
  }

  private async staffCard(userId: string): Promise<HairDoc | null> {
    const direct = await this.find(TENANT_COLLECTION.hairStaff, userId);
    if (direct) return direct;
    const snapshot = await this.collection(TENANT_COLLECTION.hairStaff)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    const doc = snapshot.docs[0];
    const item = doc ? ({ ...(doc.data() as HairDoc), id: doc.id } as HairDoc) : null;
    return item && !isDeleted(item) ? item : null;
  }
}

function encodeCursor(lastId: string): string {
  return Buffer.from(lastId, 'utf8').toString('base64url');
}

function afterCursor(sorted: { id: string }[], cursor: string): number {
  let lastId: string;
  try {
    lastId = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    return 0;
  }
  const index = sorted.findIndex((item) => item.id === lastId);
  return index === -1 ? 0 : index + 1;
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

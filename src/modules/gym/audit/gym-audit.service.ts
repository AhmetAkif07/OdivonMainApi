import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { decodeCursor, encodeCursor, resolveLimit } from '../../../shared/http/paging.dto';
import { PaginatedResult } from '../../../shared/http/paginated.result';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { GymAuditVerb } from './gym-audit.rules';
import { ListGymAuditQueryDto } from './gym-audit.dto';

export interface GymAuditLog {
  id: string;
  tenantId: string;
  createdAt: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  actorType: 'staff' | 'member' | 'system';
  method: string;
  /** e.g. `POST /gym/receivables/:id/payments` */
  route: string;
  entity: string;
  moduleLabel: string;
  verb: GymAuditVerb;
  label: string;
  entityId: string | null;
  targetUserId: string | null;
  /** Every member the action touched (target, referrer…); the member history is read through it. Older rows lack it. */
  memberIds?: string[];
  request: unknown;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  /** Field-level before/after of member records a non-member route changed, keyed by member id. */
  memberChanges?: Record<string, Record<string, { from: unknown; to: unknown }>> | null;
  /** Response kept for a few routes whose result is not visible elsewhere (e.g. a referral reward). */
  outcome?: unknown;
  result: 'success' | 'error';
  statusCode: number;
  errorCode: string | null;
  errorMessage: string | null;
  ip: string;
  userAgent: string | null;
  durationMs: number;
}

/** What the member history shows: no IP / browser and no failed attempts. */
export type MemberHistoryEntry = Omit<GymAuditLog, 'ip' | 'userAgent' | 'errorMessage' | 'tenantId'>;

const SCAN_BATCH = 200;
const HISTORY_FETCH = 500;
const SCAN_MAX = 3000;

@Injectable()
export class GymAuditService {
  private readonly logger = new Logger(GymAuditService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private collection(tenantId: string) {
    return this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.gymAuditLogs));
  }

  /** Never throws: a failed audit write must not fail the business operation it describes. */
  async write(entry: Omit<GymAuditLog, 'id'>): Promise<void> {
    try {
      const ref = this.collection(entry.tenantId).doc();
      await ref.set({ ...entry, id: ref.id });
    } catch (error) {
      this.logger.error(`Failed to write gym audit log for ${entry.route}`, error as Error);
    }
  }

  async snapshot(tenantId: string, collection: string, id: string): Promise<Record<string, unknown> | null> {
    try {
      const doc = await this.firebase.db.collection(tenantCollectionPath(tenantId, collection)).doc(id).get();
      return doc.exists ? (doc.data() as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /**
   * Newest first. Only `createdAt` is queried in Firestore (no composite index needed); the other
   * filters run in memory over at most SCAN_MAX entries per page.
   */
  async list(query: ListGymAuditQueryDto): Promise<PaginatedResult<GymAuditLog>> {
    const limit = resolveLimit(query.limit ?? 50);
    let upper = query.to ?? null;
    let afterId: string | null = null;
    if (query.cursor) {
      try {
        const cursor = decodeCursor(query.cursor);
        upper = cursor.createdAt;
        afterId = cursor.id;
      } catch {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Invalid pagination cursor');
      }
    }
    const matches: GymAuditLog[] = [];
    let scanned = 0;
    let exhausted = false;
    while (matches.length <= limit && scanned < SCAN_MAX && !exhausted) {
      let ref = this.collection(this.tenantContext.getTenantId()).orderBy('createdAt', 'desc');
      if (upper) ref = ref.where('createdAt', '<=', upper);
      if (query.from) ref = ref.where('createdAt', '>=', query.from);
      const snapshot = await ref.limit(SCAN_BATCH).get();
      const docs = snapshot.docs.map((doc) => doc.data() as GymAuditLog);
      exhausted = docs.length < SCAN_BATCH;
      scanned += docs.length;
      for (const item of docs) {
        if (afterId) {
          // Skip everything up to and including the cursor row (rows sharing its timestamp too).
          if (item.id === afterId) afterId = null;
          continue;
        }
        if (matchesFilters(item, query)) matches.push(item);
      }
      if (afterId) afterId = null;
      const last = docs.at(-1);
      if (!last) break;
      // Next batch: strictly older than the last row we read; equal timestamps are rare (ms precision).
      upper = new Date(Date.parse(last.createdAt) - 1).toISOString();
    }
    const page = matches.slice(0, limit);
    const last = page.at(-1);
    const hasMore = matches.length > limit || (!exhausted && scanned >= SCAN_MAX);
    return new PaginatedResult(page, limit, hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null);
  }

  /**
   * One member's history, newest first: every successful action whose target was the member or that
   * changed the member's record. Two queries (`targetUserId`, and `memberIds` for newer rows that also
   * name e.g. a referrer) are merged. Each is ordered by `createdAt` when its composite index exists;
   * until then it falls back to an unordered read sorted in memory.
   */
  async memberHistory(memberId: string, limit = 100, before?: string): Promise<{ items: MemberHistoryEntry[]; nextBefore: string | null }> {
    const size = Math.min(Math.max(limit, 1), 300);
    const collection = this.collection(this.tenantContext.getTenantId());
    const read = async (field: string, op: '==' | 'array-contains') => {
      const base = collection.where(field, op, memberId);
      try {
        let ordered = base.orderBy('createdAt', 'desc');
        if (before) ordered = ordered.where('createdAt', '<', before);
        return (await ordered.limit(size + 1).get()).docs.map((doc) => doc.data() as GymAuditLog);
      } catch (error) {
        if (!isMissingIndex(error)) throw error;
        this.logger.warn(`gymAuditLogs index for ${field} is missing; reading member history unordered`);
        return (await base.limit(HISTORY_FETCH).get()).docs.map((doc) => doc.data() as GymAuditLog);
      }
    };
    const [byTarget, byMember] = await Promise.all([read('targetUserId', '=='), read('memberIds', 'array-contains')]);
    const merged = new Map<string, GymAuditLog>();
    for (const item of [...byTarget, ...byMember]) {
      if (item.result !== 'success') continue;
      if (before && item.createdAt >= before) continue;
      merged.set(item.id, item);
    }
    const sorted = [...merged.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const page = sorted.slice(0, size);
    const nextBefore = sorted.length > size ? (page.at(-1)?.createdAt ?? null) : null;
    return { items: page.map(toHistoryEntry), nextBefore };
  }
}

function toHistoryEntry(item: GymAuditLog): MemberHistoryEntry {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ip, userAgent, errorMessage, tenantId, ...rest } = item;
  return rest;
}

/** Firestore answers FAILED_PRECONDITION (code 9) when a query needs a composite index that does not exist. */
function isMissingIndex(error: unknown): boolean {
  const record = error as { code?: unknown; message?: unknown } | null;
  return record?.code === 9 || record?.code === 'failed-precondition' || /requires an index/i.test(String(record?.message ?? ''));
}

function matchesFilters(item: GymAuditLog, query: ListGymAuditQueryDto): boolean {
  if (query.actorId && item.actorId !== query.actorId) return false;
  if (query.actorEmail && item.actorEmail?.toLowerCase() !== query.actorEmail.toLowerCase()) return false;
  if (query.entity && item.entity !== query.entity) return false;
  if (query.targetUserId && item.targetUserId !== query.targetUserId && item.entityId !== query.targetUserId) return false;
  if (query.result && item.result !== query.result) return false;
  if (query.verb && item.verb !== query.verb) return false;
  if (query.q) {
    const term = query.q.toLocaleLowerCase('tr');
    const text = `${item.label} ${item.actorEmail} ${item.route} ${item.entityId ?? ''} ${item.targetUserId ?? ''}`;
    if (!text.toLocaleLowerCase('tr').includes(term)) return false;
  }
  return true;
}

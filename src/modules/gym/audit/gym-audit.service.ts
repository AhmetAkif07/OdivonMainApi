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
  actorType: 'staff' | 'member';
  method: string;
  /** e.g. `POST /gym/receivables/:id/payments` */
  route: string;
  entity: string;
  moduleLabel: string;
  verb: GymAuditVerb;
  label: string;
  entityId: string | null;
  targetUserId: string | null;
  request: unknown;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  result: 'success' | 'error';
  statusCode: number;
  errorCode: string | null;
  errorMessage: string | null;
  ip: string;
  userAgent: string | null;
  durationMs: number;
}

const SCAN_BATCH = 200;
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

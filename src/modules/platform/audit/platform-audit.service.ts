import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';

export type AuditTargetType = 'tenant' | 'user' | 'payment' | 'demo';

export interface RecordPlatformAuditInput {
  adminUid: string;
  adminEmail: string;
  action: string;
  targetType: AuditTargetType;
  tenantId?: string;
  targetId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string;
}

export interface PlatformAuditLogDoc extends RecordPlatformAuditInput {
  id: string;
  createdAt: string;
}

export interface ListAuditQueryDto {
  adminUid?: string;
  tenantId?: string;
  action?: string;
  targetType?: AuditTargetType;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

const REDACTED_KEYS = new Set(['password', 'newPassword', 'token', 'resetLink', 'cardToken', 'secret']);

function sanitizeAuditFields(obj?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!obj) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (REDACTED_KEYS.has(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

@Injectable()
export class PlatformAuditService {
  private readonly logger = new Logger(PlatformAuditService.name);

  constructor(private readonly firebase: FirebaseService) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.platformAuditLogs);
  }

  async record(input: RecordPlatformAuditInput): Promise<void> {
    try {
      const ref = this.collection().doc();
      const createdAt = new Date().toISOString();

      const doc: PlatformAuditLogDoc = {
        id: ref.id,
        adminUid: input.adminUid,
        adminEmail: input.adminEmail,
        action: input.action,
        targetType: input.targetType,
        tenantId: input.tenantId,
        targetId: input.targetId,
        before: sanitizeAuditFields(input.before),
        after: sanitizeAuditFields(input.after),
        reason: input.reason ?? null,
        requestId: input.requestId ?? 'unknown',
        createdAt,
      };

      const cleanDoc = Object.fromEntries(
        Object.entries(doc).filter(([, v]) => v !== undefined),
      );

      await ref.set(cleanDoc);
    } catch (err) {
      this.logger.error(`Failed to record platform audit for ${input.action}`, err as Error);
    }
  }

  async list(query: ListAuditQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    let q: FirebaseFirestore.Query = this.collection();

    if (query.tenantId) {
      q = q.where('tenantId', '==', query.tenantId);
    }
    if (query.adminUid) {
      q = q.where('adminUid', '==', query.adminUid);
    }
    if (query.targetType) {
      q = q.where('targetType', '==', query.targetType);
    }
    if (query.action) {
      q = q.where('action', '==', query.action);
    }

    const snapshot = await q.get();
    let docs = snapshot.docs.map((d) => d.data() as PlatformAuditLogDoc);

    // In-memory date filtering & sorting to avoid index blowup
    if (query.from) {
      docs = docs.filter((d) => d.createdAt >= query.from!);
    }
    if (query.to) {
      docs = docs.filter((d) => d.createdAt <= query.to!);
    }

    docs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const total = docs.length;
    const offset = (page - 1) * pageSize;
    const items = docs.slice(offset, offset + pageSize);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async listByTenant(tenantId: string, limit = 25): Promise<PlatformAuditLogDoc[]> {
    const snapshot = await this.collection()
      .where('tenantId', '==', tenantId)
      .limit(limit * 2)
      .get();

    return snapshot.docs
      .map((d) => d.data() as PlatformAuditLogDoc)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

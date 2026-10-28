import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { paginateInMemory } from '../../../shared/http/paginate-memory';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { GymMember } from '../members/member.entity';
import {
  computeDesiredState,
  DesiredUserState,
  gateCapabilities,
  sameDesiredState,
  SYNC_KIND,
  syncDocId,
} from './access-rules';
import { SyncListQueryDto, SyncStatus, SYNC_STATUSES } from './access.dto';
import { AccessDoc, AccessRepository } from './access.repository';

/** Firestore allows 500 writes per transaction; stay well below it. */
const RESYNC_CHUNK = 200;

interface NextDocOptions {
  /** Write even if the desired state did not change (resync). */
  force: boolean;
  /** Create a document for a member that must not be on the device (resync clean-up). */
  createDisabled: boolean;
}

/**
 * Keeps one desired-state document per (gate, member) in `gymDeviceCommands`. Each change bumps
 * `version` and returns the document to `pending`, so an agent acknowledging an older version is
 * told it was superseded.
 */
@Injectable()
export class AccessSyncService {
  private readonly logger = new Logger(AccessSyncService.name);

  constructor(
    private readonly repo: AccessRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  /** Member hooks call this; device sync must never fail the member operation itself. */
  async syncMemberSafely(member: GymMember): Promise<void> {
    try {
      await this.syncMember(this.tenantContext.getTenantId(), member);
    } catch (error) {
      this.logger.error(`Device sync recompute failed for member ${member.uid}: ${String(error)}`);
    }
  }

  async syncMember(tenantId: string, member: GymMember, now = new Date()): Promise<number> {
    const gates = (await this.repo.listGates(tenantId)).filter((gate) => gateCapabilities(gate['protocol']).userSync);
    if (gates.length === 0) return 0;
    const memberId = member.uid || (member as GymMember & { id?: string }).id || '';
    if (!memberId) return 0;
    const desired = computeDesiredState(member, now);
    const nowIso = now.toISOString();
    return this.repo.runTransaction(async (tx) => {
      const refs = gates.map((gate) => this.repo.syncDocs(tenantId).doc(syncDocId(gate.id, memberId)));
      const snapshots = await tx.getAll(...refs);
      let written = 0;
      snapshots.forEach((snapshot, index) => {
        const current = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
        const next = nextSyncDoc(current, tenantId, gates[index].id, memberId, desired, nowIso, {
          force: false,
          createDisabled: false,
        });
        if (next) {
          tx.set(refs[index], next);
          written++;
        }
      });
      return written;
    });
  }

  async resync(gateId: string, now = new Date()) {
    const tenantId = this.tenantContext.getTenantId();
    const gate = (await this.repo.listGates(tenantId)).find((item) => item.id === gateId);
    if (!gate) {
      throw new AppException(ErrorCode.GYM_GATE_NOT_FOUND, 'Gate not found');
    }
    if (!gateCapabilities(gate['protocol']).userSync) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Gate protocol does not support user sync');
    }
    const members = await this.repo.listAllMembers(tenantId);
    const nowIso = now.toISOString();
    let queued = 0;
    for (let start = 0; start < members.length; start += RESYNC_CHUNK) {
      const chunk = members.slice(start, start + RESYNC_CHUNK).filter((member) => member.uid);
      if (chunk.length === 0) continue;
      queued += await this.repo.runTransaction(async (tx) => {
        const refs = chunk.map((member) => this.repo.syncDocs(tenantId).doc(syncDocId(gateId, member.uid)));
        const snapshots = await tx.getAll(...refs);
        let written = 0;
        snapshots.forEach((snapshot, index) => {
          const current = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
          const desired = computeDesiredState(chunk[index], now);
          const next = nextSyncDoc(current, tenantId, gateId, chunk[index].uid, desired, nowIso, {
            force: true,
            createDisabled: true,
          });
          if (next) {
            tx.set(refs[index], next);
            written++;
          }
        });
        return written;
      });
    }
    return { gateId, queued };
  }

  async list(query: SyncListQueryDto) {
    const docs = await this.repo.listSyncDocs(this.tenantContext.getTenantId());
    // "pending" also covers items an agent picked up but has not confirmed yet (delivered).
    const statuses = query.status === 'pending' ? ['pending', 'delivered'] : query.status ? [query.status] : null;
    const filtered = docs
      .filter((doc) => (!query.gateId || doc['gateId'] === query.gateId) && (!statuses || statuses.includes(String(doc['status']))))
      .map((doc) => ({ ...doc, createdAt: String(doc['createdAt'] ?? ''), updatedAt: String(doc['updatedAt'] ?? doc['createdAt'] ?? '') }))
      // Most recently changed first: a member whose end date was just edited is at the top.
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    return paginateInMemory(filtered, query.limit ?? 100, query.cursor);
  }

  /**
   * Counts per gate and status with aggregation queries: the panel polls this, and reading every
   * desired-state document (one per member and gate) on each poll would cost thousands of reads.
   */
  async summary() {
    const tenantId = this.tenantContext.getTenantId();
    const gates = (await this.repo.listGates(tenantId)).filter((gate) => gateCapabilities(gate['protocol']).userSync);
    const counts = await Promise.all(
      gates.flatMap((gate) =>
        SYNC_STATUSES.map(async (status) => ({
          gateId: gate.id,
          status,
          count: await this.repo.countSyncDocs(tenantId, gate.id, status),
        })),
      ),
    );
    const result: Record<string, Record<SyncStatus, number>> = {};
    for (const { gateId, status, count } of counts) {
      result[gateId] ??= { pending: 0, delivered: 0, applied: 0, error: 0 };
      result[gateId][status] = count;
    }
    return result;
  }
}

/** Returns the document to write, or null when nothing changes. */
export function nextSyncDoc(
  current: Record<string, unknown> | null,
  tenantId: string,
  gateId: string,
  memberId: string,
  computed: DesiredUserState,
  nowIso: string,
  options: NextDocOptions,
): AccessDoc | null {
  const currentUserId = typeof current?.['userId'] === 'string' ? (current['userId'] as string) : '';
  let desired = computed;
  if (!desired.userId) {
    // Without a member number the device cannot be addressed; revoke what was written before.
    if (!currentUserId) return null;
    desired = { ...desired, userId: currentUserId, enabled: false };
  }
  if (!current && !desired.enabled && !options.createDisabled) return null;
  if (!options.force && current?.['kind'] === SYNC_KIND && sameDesiredState(current, desired)) return null;

  // A changed member number leaves the old user on the device; tell the agent to remove it.
  const pendingReplace =
    typeof current?.['replacesUserId'] === 'string' && current['status'] !== 'applied'
      ? (current['replacesUserId'] as string)
      : null;
  const replacesUserId =
    currentUserId && currentUserId !== desired.userId ? currentUserId : pendingReplace !== desired.userId ? pendingReplace : null;

  return {
    id: syncDocId(gateId, memberId),
    kind: SYNC_KIND,
    tenantId,
    gateId,
    memberId,
    ...desired,
    replacesUserId,
    version: (Number(current?.['version']) || 0) + 1,
    status: 'pending',
    deliveredVersion: (current?.['deliveredVersion'] as number | null | undefined) ?? null,
    appliedVersion: (current?.['appliedVersion'] as number | null | undefined) ?? null,
    leaseUntil: null,
    attempts: 0,
    lastError: null,
    createdAt: (current?.['createdAt'] as string | undefined) ?? nowIso,
    updatedAt: nowIso,
    deletedAt: null,
  };
}

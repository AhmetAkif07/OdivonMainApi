import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { GymMember } from '../members/member.entity';
import {
  gateCapabilities,
  generateAgentToken,
  generatePairingCode,
  isGateOnline,
  isRecent,
  LEASE_MS,
  normalizePairingCode,
  PAIRING_CODE_TTL_MS,
  PROTOCOL_TABLE,
  resolveProtocol,
  sha256Hex,
  SYNC_KIND,
} from './access-rules';
import {
  AgentAckDto,
  AgentEventDto,
  AgentEventsBatchDto,
  AgentHeartbeatDto,
  CreatePairingCodeDto,
  EnrollAgentDto,
} from './access.dto';
import { AccessDoc, AccessRepository, withId } from './access.repository';
import { forgetAgent } from './agent-auth.guard';
import { AgentPrincipal } from './agent-principal';

export const DEFAULT_WORK_LIMIT = 50;
/** Idle agents ask for work this often; they ask again at once while a full page keeps coming. */
export const POLL_AFTER_MS = 30_000;
const EVENT_WRITE_CHUNK = 50;
const MAX_RAW_BYTES = 4096;

type Rejection = { eventId: string; reason: string };

@Injectable()
export class AccessAgentsService {
  constructor(
    private readonly repo: AccessRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  // ─── Admin (Firebase user, tenant from TenantGuard) ─────────────────────────

  async createPairingCode(dto: CreatePairingCodeDto, now = new Date()) {
    const tenantId = this.tenantContext.getTenantId();
    const gateIds = [...new Set(dto.gateIds)];
    const gates = new Set((await this.repo.listGates(tenantId)).map((gate) => gate.id));
    if (gateIds.some((gateId) => !gates.has(gateId))) {
      throw new AppException(ErrorCode.GYM_GATE_NOT_FOUND, 'Gate not found');
    }
    const expiresAt = new Date(now.getTime() + PAIRING_CODE_TTL_MS).toISOString();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePairingCode();
      try {
        await this.repo.pairingCodeRef(sha256Hex(code)).create({
          tenantId,
          gateIds,
          createdBy: this.tenantContext.getUserId(),
          createdAt: now.toISOString(),
          expiresAt,
          usedAt: null,
          agentId: null,
        });
        return { code, expiresAt };
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
    }
    throw new Error('Could not allocate a pairing code');
  }

  async listAgents(now = Date.now()) {
    const agents = await this.repo.listAgents(this.tenantContext.getTenantId());
    return agents
      .map((agent) => ({
        id: agent.id,
        name: agent['name'] ?? '',
        hostname: agent['hostname'] ?? null,
        agentVersion: agent['agentVersion'] ?? null,
        gateIds: agent['gateIds'] ?? [],
        lastHeartbeatAt: agent['lastHeartbeatAt'] ?? null,
        online: !agent['revokedAt'] && isRecent(agent['lastHeartbeatAt'], now),
        revokedAt: agent['revokedAt'] ?? null,
        createdAt: agent['createdAt'] ?? null,
      }))
      .sort((left, right) => String(right.createdAt ?? '').localeCompare(String(left.createdAt ?? '')));
  }

  async revokeAgent(agentId: string, now = new Date()) {
    const tenantId = this.tenantContext.getTenantId();
    const agentRef = this.repo.agents(tenantId).doc(agentId);
    const nowIso = now.toISOString();
    await this.repo.runTransaction(async (tx) => {
      const snapshot = await tx.get(agentRef);
      if (!snapshot.exists) {
        throw new AppException(ErrorCode.GYM_AGENT_NOT_FOUND, 'Agent not found');
      }
      const gates = await tx.get(this.repo.gates(tenantId).where('agentId', '==', agentId));
      const indexRef = this.repo.agentIndexRef(agentId);
      const index = await tx.get(indexRef);
      tx.update(agentRef, { revokedAt: snapshot.data()?.['revokedAt'] ?? nowIso, updatedAt: nowIso });
      if (index.exists && index.data()?.['tenantId'] === tenantId) {
        tx.update(indexRef, { revokedAt: index.data()?.['revokedAt'] ?? nowIso });
      }
      gates.docs.forEach((gate) => tx.update(gate.ref, { agentId: null, updatedAt: nowIso }));
    });
    forgetAgent(agentId);
    return { id: agentId, revokedAt: nowIso };
  }

  /** Gate list with server-derived protocol fields and the read-time `online` flag. */
  async decorateGates<T extends AccessDoc>(gates: T[], now = Date.now()) {
    const agents = new Map(
      (await this.repo.listAgents(this.tenantContext.getTenantId())).map((agent) => [agent.id, agent]),
    );
    return gates.map((gate) => decorateGate(gate, agents.get(String(gate['agentId'] ?? '')), now));
  }

  // ─── Enrollment (no identity; the pairing code decides the tenant) ──────────

  async enroll(dto: EnrollAgentDto, now = new Date()) {
    const codeRef = this.repo.pairingCodeRef(sha256Hex(normalizePairingCode(dto.code)));
    const token = generateAgentToken();
    const tokenHash = sha256Hex(token);
    const nowIso = now.toISOString();

    return this.repo.runTransaction(async (tx) => {
      const codeSnapshot = await tx.get(codeRef);
      const code = codeSnapshot.exists ? (codeSnapshot.data() as Record<string, unknown>) : null;
      if (
        !code ||
        code['usedAt'] ||
        typeof code['tenantId'] !== 'string' ||
        !(new Date(String(code['expiresAt'])).getTime() > now.getTime())
      ) {
        throw new AppException(ErrorCode.GYM_AGENT_PAIRING_INVALID, 'Pairing code is invalid or expired');
      }
      const tenantId = code['tenantId'] as string;
      const requested = Array.isArray(code['gateIds']) ? (code['gateIds'] as unknown[]).map(String) : [];
      const gateRefs = requested.map((gateId) => this.repo.gates(tenantId).doc(gateId));
      const gateSnapshots = gateRefs.length ? await tx.getAll(...gateRefs) : [];
      const live = gateSnapshots.filter((snapshot) => snapshot.exists && !snapshot.data()?.['deletedAt']);
      const gateIds = live.map((snapshot) => snapshot.id);

      const agentRef = this.repo.agents(tenantId).doc();
      const agentId = agentRef.id;
      // A gate belongs to one agent: pairing moves it away from its previous agent.
      const previousIds = [
        ...new Set(live.map((snapshot) => snapshot.data()?.['agentId']).filter((id): id is string => typeof id === 'string' && !!id)),
      ];
      const previousRefs = previousIds.map((id) => this.repo.agents(tenantId).doc(id));
      const previous = previousRefs.length ? await tx.getAll(...previousRefs) : [];

      tx.update(codeRef, { usedAt: nowIso, agentId });
      tx.set(agentRef, {
        id: agentId,
        tenantId,
        name: dto.name.trim(),
        hostname: dto.hostname?.trim() || null,
        agentVersion: dto.agentVersion?.trim() || null,
        tokenHash,
        gateIds,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastHeartbeatAt: null,
        queueDepth: 0,
        revokedAt: null,
      });
      tx.set(this.repo.agentIndexRef(agentId), { tenantId, tokenHash, revokedAt: null, createdAt: nowIso });
      live.forEach((snapshot) => tx.update(snapshot.ref, { agentId, updatedAt: nowIso }));
      previous.forEach((snapshot) => {
        if (!snapshot.exists) return;
        const kept = ((snapshot.data()?.['gateIds'] as string[] | undefined) ?? []).filter((id) => !gateIds.includes(id));
        tx.update(snapshot.ref, { gateIds: kept, updatedAt: nowIso });
      });
      return { agentId, token, tenantId, gateIds };
    });
  }

  // ─── Agent endpoints (AgentAuthGuard) ───────────────────────────────────────

  async work(agent: AgentPrincipal, limit = DEFAULT_WORK_LIMIT, now = new Date()) {
    const devices = await this.agentGates(agent);
    const syncGateIds = devices.filter((gate) => gateCapabilities(gate['protocol']).userSync).map((gate) => gate.id);
    const items = syncGateIds.length ? await this.leaseWork(agent.tenantId, syncGateIds, limit, now) : [];
    return {
      devices: devices.map((gate) => {
        const protocol = resolveProtocol(gate['protocol']);
        return {
          gateId: gate.id,
          name: gate['name'] ?? '',
          protocol,
          host: gate['host'] ?? null,
          port: gate['port'] ?? PROTOCOL_TABLE[protocol].defaultPort,
          direction: gate['direction'] ?? 'in',
          capabilities: gateCapabilities(protocol),
        };
      }),
      items,
      pollAfterMs: items.length >= limit ? 0 : POLL_AFTER_MS,
    };
  }

  /**
   * Atomic delivery: inside one transaction pick pending items and items whose lease expired,
   * then lease them for 60 s. Firestore serialises conflicting transactions, so the same
   * document is never handed out twice at once.
   */
  private leaseWork(tenantId: string, gateIds: string[], limit: number, now: Date) {
    const nowIso = now.toISOString();
    const leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
    const docs = this.repo.syncDocs(tenantId);
    return this.repo.runTransaction(async (tx) => {
      const pending = await tx.get(docs.where('gateId', 'in', gateIds).where('status', '==', 'pending').limit(limit));
      const expired = await tx.get(
        docs
          .where('gateId', 'in', gateIds)
          .where('status', '==', 'delivered')
          .where('leaseUntil', '<', nowIso)
          .limit(limit),
      );
      const seen = new Set<string>();
      const picked = [...pending.docs, ...expired.docs].filter((snapshot) => {
        const data = snapshot.data();
        if (seen.has(snapshot.id) || data['kind'] !== SYNC_KIND || !gateIds.includes(String(data['gateId']))) {
          return false;
        }
        seen.add(snapshot.id);
        return true;
      });
      return picked.slice(0, limit).map((snapshot) => {
        const data = snapshot.data();
        tx.update(snapshot.ref, {
          status: 'delivered',
          deliveredVersion: data['version'],
          leaseUntil,
          attempts: (Number(data['attempts']) || 0) + 1,
          updatedAt: nowIso,
        });
        return {
          id: snapshot.id,
          gateId: data['gateId'],
          memberId: data['memberId'],
          userId: data['userId'],
          name: data['name'],
          card: data['card'] ?? null,
          validEnd: data['validEnd'] ?? null,
          enabled: data['enabled'] === true,
          version: data['version'],
          replacesUserId: data['replacesUserId'] ?? null,
        };
      });
    });
  }

  async ack(agent: AgentPrincipal, id: string, dto: AgentAckDto, now = new Date()) {
    if (dto.result === 'applied' && dto.verified !== true) {
      throw new AppException(ErrorCode.GYM_SYNC_ACK_INVALID, 'Applied results must be verified on the device');
    }
    const ref = this.repo.syncDocs(agent.tenantId).doc(id);
    const nowIso = now.toISOString();
    return this.repo.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const doc = snapshot.exists ? (snapshot.data() as Record<string, unknown>) : null;
      if (!doc || doc['kind'] !== SYNC_KIND) {
        throw new AppException(ErrorCode.GYM_SYNC_ITEM_NOT_FOUND, 'Sync item not found');
      }
      if (!agent.gateIds.includes(String(doc['gateId']))) {
        throw new AppException(ErrorCode.GYM_AGENT_FORBIDDEN, 'Gate is not assigned to this agent');
      }
      const version = Number(doc['version']) || 0;
      if (dto.version < version) {
        return { status: 'superseded' as const, version };
      }
      if (dto.version > version) {
        throw new AppException(ErrorCode.GYM_SYNC_ACK_INVALID, 'Unknown sync item version');
      }
      if (dto.result === 'applied') {
        tx.update(ref, {
          status: 'applied',
          appliedVersion: version,
          leaseUntil: null,
          lastError: null,
          replacesUserId: null,
          updatedAt: nowIso,
        });
        return { status: 'applied' as const, version };
      }
      tx.update(ref, {
        status: 'error',
        lastError: (dto.error ?? 'Unknown device error').slice(0, 500),
        leaseUntil: null,
        updatedAt: nowIso,
      });
      return { status: 'error' as const, version };
    });
  }

  async events(agent: AgentPrincipal, dto: AgentEventsBatchDto, now = new Date()) {
    const gates = new Map((await this.agentGates(agent)).map((gate) => [gate.id, gate]));
    const rejected: Rejection[] = [];
    const accepted: { docId: string; event: AgentEventDto; timestamp: string }[] = [];
    const inBatch = new Set<string>();
    let duplicates = 0;

    for (const event of dto.events) {
      if (!gates.has(event.gateId)) {
        rejected.push({ eventId: event.eventId, reason: 'gate_forbidden' });
        continue;
      }
      if (!/^[^/]{1,200}$/.test(event.eventId) || event.eventId === '.' || event.eventId === '..') {
        rejected.push({ eventId: event.eventId, reason: 'invalid_event_id' });
        continue;
      }
      const time = new Date(event.time);
      if (Number.isNaN(time.getTime())) {
        rejected.push({ eventId: event.eventId, reason: 'invalid_time' });
        continue;
      }
      const docId = `${event.gateId}_${event.eventId}`;
      if (inBatch.has(docId)) {
        duplicates++;
        continue;
      }
      inBatch.add(docId);
      accepted.push({ docId, event, timestamp: time.toISOString() });
    }

    const members = await this.memberLookup(
      agent.tenantId,
      accepted.map(({ event }) => event.userId?.trim() ?? ''),
      accepted.map(({ event }) => event.card?.trim() ?? ''),
    );
    const nowIso = now.toISOString();
    let written = 0;
    for (let start = 0; start < accepted.length; start += EVENT_WRITE_CHUNK) {
      const results = await Promise.allSettled(
        accepted.slice(start, start + EVENT_WRITE_CHUNK).map(({ docId, event, timestamp }) =>
          this.repo
            .logs(agent.tenantId)
            .doc(docId)
            .create(buildAccessLog(agent, docId, event, timestamp, gates.get(event.gateId)!, members, nowIso)),
        ),
      );
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          written++;
        } else if (isAlreadyExists(result.reason)) {
          duplicates++;
        } else {
          rejected.push({ eventId: accepted[start + index].event.eventId, reason: 'write_failed' });
        }
      });
    }
    return { accepted: written, duplicates, rejected };
  }

  async heartbeat(agent: AgentPrincipal, dto: AgentHeartbeatDto, now = new Date()) {
    const forbidden = dto.devices.find((device) => !agent.gateIds.includes(device.gateId));
    if (forbidden) {
      throw new AppException(ErrorCode.GYM_AGENT_FORBIDDEN, 'Gate is not assigned to this agent');
    }
    const nowIso = now.toISOString();
    const batch = this.repo.db.batch();
    batch.update(this.repo.agents(agent.tenantId).doc(agent.agentId), {
      lastHeartbeatAt: nowIso,
      ...(dto.agentVersion ? { agentVersion: dto.agentVersion } : {}),
      queueDepth: dto.queueDepth ?? 0,
      updatedAt: nowIso,
    });
    const gates = new Set((await this.agentGates(agent)).map((gate) => gate.id));
    for (const device of dto.devices) {
      if (!gates.has(device.gateId)) continue;
      batch.update(this.repo.gates(agent.tenantId).doc(device.gateId), {
        ...(device.reachable ? { lastSeenAt: nowIso } : {}),
        lastError: device.lastError ?? null,
        lastEventAt: device.lastEventAt ?? null,
        deviceTime: device.deviceTime ?? null,
      });
    }
    await batch.commit();
    return { serverTime: nowIso };
  }

  /** Live gates that are both listed on the agent and still point back at it. */
  private async agentGates(agent: AgentPrincipal): Promise<AccessDoc[]> {
    if (agent.gateIds.length === 0) return [];
    const refs = agent.gateIds.map((gateId) => this.repo.gates(agent.tenantId).doc(gateId));
    const snapshots = await this.repo.db.getAll(...refs);
    return snapshots
      .filter((snapshot) => snapshot.exists)
      .map((snapshot) => withId(snapshot.id, snapshot.data()))
      .filter((gate) => !gate['deletedAt'] && gate['agentId'] === agent.agentId);
  }

  /**
   * Loads only the members named in a batch (by member number or RFID card), instead of the
   * whole member list: a batch then costs a few reads, however large the gym is.
   */
  private async memberLookup(tenantId: string, numbers: string[], cards: string[]) {
    const byNumber = new Map<string, GymMember>();
    const byCard = new Map<string, GymMember>();
    const wantedNumbers = [...new Set(numbers.filter(Boolean))];
    const wantedCards = [...new Set(cards.filter(Boolean))];
    const [numberMatches, cardMatches] = await Promise.all([
      this.repo.findMembersByField(tenantId, 'memberNumber', withNumericVariants(wantedNumbers)),
      this.repo.findMembersByField(tenantId, 'rfidCardNumber', wantedCards),
    ]);
    for (const member of numberMatches) {
      if (!member.deletedAt && member.memberNumber != null) byNumber.set(String(member.memberNumber).trim(), member);
    }
    for (const member of cardMatches) {
      if (!member.deletedAt && member.rfidCardNumber) byCard.set(member.rfidCardNumber.trim(), member);
    }
    return { byNumber, byCard };
  }

}

export function decorateGate<T extends AccessDoc>(
  gate: T,
  agent: Record<string, unknown> | undefined,
  now: number,
) {
  const protocol = resolveProtocol(gate['protocol']);
  const table = PROTOCOL_TABLE[protocol];
  return {
    ...gate,
    protocol,
    host: gate['host'] ?? null,
    port: gate['port'] ?? table.defaultPort,
    agentId: gate['agentId'] ?? null,
    capabilities: { ...table.capabilities },
    adapterStatus: table.adapterStatus,
    lastSeenAt: gate['lastSeenAt'] ?? null,
    lastError: gate['lastError'] ?? null,
    online: isGateOnline(gate, agent, now),
  };
}

function buildAccessLog(
  agent: AgentPrincipal,
  docId: string,
  event: AgentEventDto,
  timestamp: string,
  gate: AccessDoc,
  members: { byNumber: Map<string, GymMember>; byCard: Map<string, GymMember> } | null,
  nowIso: string,
) {
  const deviceUserId = event.userId?.trim() || null;
  const card = event.card?.trim() || null;
  const member =
    (deviceUserId ? members?.byNumber.get(deviceUserId) : undefined) ??
    (card ? members?.byCard.get(card) : undefined) ??
    null;
  const status = event.result === 'granted' || event.result === 'denied' ? event.result : 'unknown';
  const direction = event.direction === 'in' || event.direction === 'out' ? event.direction : String(gate['direction'] ?? 'in');
  const rawVerifyMode = event.verifyMode ?? null;
  const raw = event.raw && JSON.stringify(event.raw).length <= MAX_RAW_BYTES ? event.raw : null;
  const createdBy = `agent:${agent.agentId}`;
  return {
    id: docId,
    tenantId: agent.tenantId,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy,
    updatedBy: createdBy,
    deletedAt: null,
    source: 'agent',
    gateId: event.gateId,
    gateName: String(gate['name'] ?? 'Turnike'),
    eventId: event.eventId,
    deviceUserId,
    card,
    userId: member?.uid ?? null,
    userName: member?.displayName ?? (deviceUserId ? `#${deviceUserId}` : card ? `Kart ${card}` : 'Bilinmeyen'),
    userPhoto: member?.photoURL ?? null,
    direction,
    method: verifyMethod(rawVerifyMode),
    rawVerifyMode,
    status,
    notes: status === 'unknown' ? 'Cihaz sonucu bildirmedi.' : null,
    timestamp,
    raw,
  };
}

function verifyMethod(mode: string | null): string {
  const value = (mode ?? '').toLowerCase();
  if (value.includes('face')) return 'face';
  if (value.includes('card') || value.includes('rfid')) return 'rfid';
  if (value.includes('finger') || value === 'fp') return 'fingerprint';
  if (value.includes('qr')) return 'qr';
  if (value.includes('pass') || value.includes('pin')) return 'pin';
  return value || 'unknown';
}

/** Member numbers may be stored as numbers on older documents: query both forms. */
function withNumericVariants(values: string[]): (string | number)[] {
  const out: (string | number)[] = [];
  for (const value of values) {
    out.push(value);
    if (/^[1-9]\d{0,14}$/.test(value)) out.push(Number(value));
  }
  return out;
}

function isAlreadyExists(error: unknown): boolean {
  const record = error as { code?: unknown; message?: unknown } | null;
  return record?.code === 6 || record?.code === 'already-exists' || /ALREADY_EXISTS/i.test(String(record?.message ?? ''));
}

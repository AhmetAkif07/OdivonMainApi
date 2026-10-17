import { createHash, randomBytes, randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { AgentAckDto, AgentEventsBatchDto, AgentHeartbeatDto, CreatePairingCodeDto, EnrollAgentDto } from '../parking.dto';
import { ParkingService } from '../parking.service';
import { ParkingLane } from '../parking.types';
import { ParkingAgentPrincipal } from './parking-agent-principal';

@Injectable()
export class ParkingAgentService {
  constructor(private readonly firebase: FirebaseService, private readonly tenant: TenantContext, private readonly parking: ParkingService) {}
  private tenantCollection(tenantId: string, name: string) { return this.firebase.db.collection(tenantCollectionPath(tenantId, name)); }
  async pairingCode(dto: CreatePairingCodeDto) {
    const code = randomBytes(6).toString('base64url').slice(0, 10).toUpperCase(); const hash = createHash('sha256').update(code).digest('hex');
    await this.firebase.db.collection(ROOT_COLLECTION.parkingAgentPairingCodes).doc(hash).set({ tenantId: this.tenant.getTenantId(), laneIds: [...new Set(dto.laneIds)], expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), usedAt: null, createdBy: this.tenant.getUserId(), createdAt: new Date().toISOString() });
    return { code, expiresInSeconds: 600 };
  }
  async list() {
    const snapshot = await this.tenantCollection(this.tenant.getTenantId(), TENANT_COLLECTION.parkingDeviceAgents).get(); return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), tokenHash: undefined }));
  }
  async revoke(id: string) { const now = new Date().toISOString(); await this.tenantCollection(this.tenant.getTenantId(), TENANT_COLLECTION.parkingDeviceAgents).doc(id).update({ revokedAt: now, updatedAt: now }); await this.firebase.db.collection(ROOT_COLLECTION.parkingAgentIndex).doc(id).delete(); return { id }; }
  async enroll(dto: EnrollAgentDto) {
    const codeHash = createHash('sha256').update(dto.code.trim().toUpperCase()).digest('hex'); const codeRef = this.firebase.db.collection(ROOT_COLLECTION.parkingAgentPairingCodes).doc(codeHash); const codeSnap = await codeRef.get(); const code = codeSnap.data();
    if (!codeSnap.exists || code?.['usedAt'] || Date.parse(String(code?.['expiresAt'])) <= Date.now()) throw new AppException(ErrorCode.PARKING_AGENT_PAIRING_INVALID, 'Pairing code is invalid or expired');
    const tenantId = String(code!['tenantId']); const agentId = randomUUID(); const token = randomBytes(32).toString('base64url'); const now = new Date().toISOString(); const agent = { id: agentId, tenantId, name: dto.name, hostname: dto.hostname ?? null, agentVersion: dto.agentVersion ?? null, laneIds: code!['laneIds'], tokenHash: createHash('sha256').update(token).digest('hex'), queueDepth: 0, lastSeenAt: now, lastDeviceTime: null, revokedAt: null, createdAt: now, updatedAt: now };
    await this.firebase.db.runTransaction(async (tx) => { const latest = await tx.get(codeRef); if (latest.data()?.['usedAt']) throw new AppException(ErrorCode.PARKING_AGENT_PAIRING_INVALID, 'Pairing code was already used'); tx.set(this.tenantCollection(tenantId, TENANT_COLLECTION.parkingDeviceAgents).doc(agentId), agent); tx.set(this.firebase.db.collection(ROOT_COLLECTION.parkingAgentIndex).doc(agentId), { tenantId, createdAt: now }); tx.update(codeRef, { usedAt: now, agentId }); });
    return { agentId, token, tenantId, laneIds: agent.laneIds };
  }
  async work(agent: ParkingAgentPrincipal) {
    const snapshot = await this.tenantCollection(agent.tenantId, TENANT_COLLECTION.parkingDeviceCommands).where('status', '==', 'pending').get(); const items = snapshot.docs.map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...doc.data() })).filter((item) => !item['laneId'] || agent.laneIds.includes(String(item['laneId']))).slice(0, 100); const now = new Date().toISOString(); const batch = this.firebase.db.batch(); items.forEach((item) => batch.update(this.tenantCollection(agent.tenantId, TENANT_COLLECTION.parkingDeviceCommands).doc(item.id), { status: 'delivered', deliveredTo: agent.agentId, deliveredAt: now })); await batch.commit(); return { items, pollAfterMs: items.length ? 0 : 2_000 };
  }
  async ack(agent: ParkingAgentPrincipal, id: string, dto: AgentAckDto) {
    const ref = this.tenantCollection(agent.tenantId, TENANT_COLLECTION.parkingDeviceCommands).doc(id); const snapshot = await ref.get(); const data = snapshot.data(); if (!snapshot.exists || data?.['deliveredTo'] !== agent.agentId || data?.['version'] !== dto.version) throw new AppException(ErrorCode.PARKING_CONFLICT, 'Command acknowledgement is stale or forbidden'); const now = new Date().toISOString(); await ref.update({ status: dto.result, error: dto.error ?? null, acknowledgedAt: now, updatedAt: now }); return { id, status: dto.result };
  }
  async events(agent: ParkingAgentPrincipal, dto: AgentEventsBatchDto) {
    const collection = this.tenantCollection(agent.tenantId, TENANT_COLLECTION.parkingDeviceEvents); const accepted: string[] = []; const duplicates: string[] = []; const rejected: Array<{ eventId: string; reason: string }> = [];
    for (const event of dto.events) { if (!agent.laneIds.includes(event.laneId)) { rejected.push({ eventId: event.eventId, reason: 'lane_not_assigned' }); continue; } const id = createHash('sha256').update(`${agent.agentId}:${event.eventId}`).digest('hex'); const ref = collection.doc(id); const snapshot = await ref.get(); if (snapshot.exists && snapshot.data()?.['processed']) { duplicates.push(event.eventId); continue; } const now = new Date().toISOString(); if (!snapshot.exists) await ref.create({ id, tenantId: agent.tenantId, agentId: agent.agentId, ...event, receivedAt: now, serverTime: now, processed: false }); try { const laneSnapshot = await this.tenantCollection(agent.tenantId, TENANT_COLLECTION.parkingLanes).doc(event.laneId).get(); const lane = laneSnapshot.data() as ParkingLane | undefined; if (!laneSnapshot.exists || !lane || !lane.active) throw new Error('lane_not_active'); if ((event.kind === 'entry' && lane.direction === 'exit') || (event.kind === 'exit' && lane.direction === 'entry')) throw new Error('lane_direction_mismatch'); await this.parking.processAgentEvent(event, { ...lane, id: laneSnapshot.id }, `parking-agent:${agent.agentId}:${event.eventId}`); await ref.update({ processed: true, processedAt: new Date().toISOString(), processingError: null }); accepted.push(event.eventId); } catch (error) { const reason = error instanceof Error ? error.message : 'processing_failed'; await ref.update({ processingError: reason, lastProcessingAttemptAt: new Date().toISOString() }); rejected.push({ eventId: event.eventId, reason }); } }
    return { accepted, duplicates, rejected };
  }
  async heartbeat(agent: ParkingAgentPrincipal, dto: AgentHeartbeatDto) { const now = new Date().toISOString(); const skewMs = dto.deviceTime ? Date.now() - Date.parse(dto.deviceTime) : null; await this.tenantCollection(agent.tenantId, TENANT_COLLECTION.parkingDeviceAgents).doc(agent.agentId).update({ agentVersion: dto.agentVersion ?? null, queueDepth: dto.queueDepth, lastDeviceTime: dto.deviceTime ?? null, clockSkewMs: Number.isFinite(skewMs) ? skewMs : null, lastSeenAt: now, updatedAt: now }); return { serverTime: now, clockSkewMs: Number.isFinite(skewMs) ? skewMs : null };
  }
}

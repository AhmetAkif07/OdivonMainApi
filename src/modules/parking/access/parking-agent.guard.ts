import { createHash, timingSafeEqual } from 'crypto';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { PARKING_AGENT_KEY, ParkingAgentPrincipal } from './parking-agent-principal';

@Injectable()
export class ParkingAgentGuard implements CanActivate {
  constructor(private readonly firebase: FirebaseService, private readonly tenant: TenantContext) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Record<string, unknown> & { headers?: Record<string, string> }>();
    const raw = String(request.headers?.['authorization'] ?? '');
    const match = /^Agent ([^.]+)\.(.+)$/.exec(raw);
    if (!match) this.unauthorized();
    const index = await this.firebase.db.collection(ROOT_COLLECTION.parkingAgentIndex).doc(match![1]).get();
    const tenantId = String(index.data()?.['tenantId'] ?? '');
    if (!index.exists || !tenantId) this.unauthorized();
    const snapshot = await this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.parkingDeviceAgents)).doc(match![1]).get();
    const data = snapshot.data(); const hash = createHash('sha256').update(match![2]).digest(); const stored = Buffer.from(String(data?.['tokenHash'] ?? ''), 'hex');
    if (!snapshot.exists || data?.['revokedAt'] || stored.length !== hash.length || !timingSafeEqual(stored, hash)) this.unauthorized();
    const principal: ParkingAgentPrincipal = { agentId: match![1], tenantId, laneIds: Array.isArray(data?.['laneIds']) ? data!['laneIds'] as string[] : [] };
    request[PARKING_AGENT_KEY] = principal;
    const laneSnapshots = await Promise.all(principal.laneIds.map((laneId) => this.firebase.db.collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.parkingLanes)).doc(laneId).get()));
    const branchIds = [...new Set(laneSnapshots.map((lane) => String(lane.data()?.['facilityId'] ?? '')).filter(Boolean))];
    this.tenant.enter({ tenantId, userId: `agent:${principal.agentId}`, role: 'user', modules: ['parking'], email: '', branchIds, allBranches: false, permissions: {} });
    return true;
  }
  private unauthorized(): never { throw new AppException(ErrorCode.PARKING_AGENT_UNAUTHORIZED, 'Invalid or revoked parking agent credentials'); }
}


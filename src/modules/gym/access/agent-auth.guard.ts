import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { RequestWithTenant, TenantContext, TenantStore } from '../../../shared/tenancy/tenant.context';
import { parseAgentAuthorization, safeEqualHex, sha256Hex } from './access-rules';
import { AccessRepository } from './access.repository';
import { AGENT_PRINCIPAL_KEY, AgentPrincipal, RequestWithAgent } from './agent-principal';

/**
 * Authenticates `Authorization: Agent <agentId>.<token>` against the top-level agent index and
 * builds the tenant context from it. Firebase ID tokens are not accepted here, and agent tokens
 * are not accepted by the Firebase guard.
 */
@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    private readonly repo: AccessRepository,
    private readonly tenantContext: TenantContext,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & RequestWithAgent & RequestWithTenant>();
    const credentials = parseAgentAuthorization(request.header('authorization'));
    if (!credentials) {
      throw unauthorized();
    }

    const index = await this.repo.agentIndexRef(credentials.agentId).get();
    const entry = index.exists ? (index.data() as Record<string, unknown>) : null;
    const tokenHash = typeof entry?.['tokenHash'] === 'string' ? (entry['tokenHash'] as string) : '';
    const tenantId = typeof entry?.['tenantId'] === 'string' ? (entry['tenantId'] as string) : '';
    if (!entry || !tenantId || entry['revokedAt'] || !safeEqualHex(sha256Hex(credentials.token), tokenHash)) {
      throw unauthorized();
    }

    const agentSnapshot = await this.repo.agents(tenantId).doc(credentials.agentId).get();
    const agent = agentSnapshot.exists ? (agentSnapshot.data() as Record<string, unknown>) : null;
    if (!agent || agent['revokedAt']) {
      throw unauthorized();
    }

    const principal: AgentPrincipal = {
      agentId: credentials.agentId,
      tenantId,
      gateIds: Array.isArray(agent['gateIds']) ? (agent['gateIds'] as unknown[]).map(String) : [],
    };
    const store: TenantStore = {
      tenantId,
      userId: `agent:${credentials.agentId}`,
      role: 'user',
      modules: ['gym'],
      email: '',
      permissions: {},
    };
    this.tenantContext.enter(store);
    request.currentUser = store;
    request[AGENT_PRINCIPAL_KEY] = principal;
    return true;
  }
}

function unauthorized() {
  return new AppException(ErrorCode.GYM_AGENT_UNAUTHORIZED, 'Invalid or revoked agent credentials');
}

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

/** Identity of an authenticated edge agent; built only from the agent index and agent record. */
export interface AgentPrincipal {
  agentId: string;
  tenantId: string;
  gateIds: string[];
}

export const AGENT_PRINCIPAL_KEY = 'accessAgent';

export type RequestWithAgent = { [AGENT_PRINCIPAL_KEY]?: AgentPrincipal };

export const CurrentAgent = createParamDecorator((_data: unknown, context: ExecutionContext): AgentPrincipal => {
  const agent = context.switchToHttp().getRequest<RequestWithAgent>()[AGENT_PRINCIPAL_KEY];
  if (!agent) {
    throw new AppException(ErrorCode.GYM_AGENT_UNAUTHORIZED, 'Agent credentials are required');
  }
  return agent;
});

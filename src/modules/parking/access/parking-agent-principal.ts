import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';

export interface ParkingAgentPrincipal { agentId: string; tenantId: string; laneIds: string[]; }
export const PARKING_AGENT_KEY = 'parkingAgent';
export const CurrentParkingAgent = createParamDecorator((_data: unknown, context: ExecutionContext): ParkingAgentPrincipal => {
  const agent = context.switchToHttp().getRequest<Record<string, unknown>>()[PARKING_AGENT_KEY] as ParkingAgentPrincipal | undefined;
  if (!agent) throw new AppException(ErrorCode.PARKING_AGENT_UNAUTHORIZED, 'Agent identity is missing');
  return agent;
});


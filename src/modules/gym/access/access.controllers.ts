import { Body, Controller, Delete, Get, HttpCode, Injectable, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { ClientThrottlerGuard } from '../../../shared/http/client-throttler.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { AccessAgentsService } from './access-agents.service';
import { AccessSyncService } from './access-sync.service';
import {
  AgentAckDto,
  AgentEventsBatchDto,
  AgentHeartbeatDto,
  AgentWorkQueryDto,
  CreatePairingCodeDto,
  EnrollAgentDto,
  ResyncDto,
  SyncListQueryDto,
} from './access.dto';
import { AgentAuthGuard } from './agent-auth.guard';
import { AgentPrincipal, CurrentAgent } from './agent-principal';

const AdminGuards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard] as const;

/** Rate-limits enrollment per client IP, also outside production where the global guard is off. */
@Injectable()
export class EnrollThrottlerGuard extends ClientThrottlerGuard {}

@ApiTags('gym-access-agents')
@ApiBearerAuth()
@RequireModule('gym')
@Roles('owner', 'admin')
@UseGuards(...AdminGuards)
@Controller('gym/access/agents')
export class AccessAgentsAdminController {
  constructor(private readonly agents: AccessAgentsService) {}

  @Post('pairing-codes')
  createPairingCode(@Body() dto: CreatePairingCodeDto) {
    return this.agents.createPairingCode(dto);
  }

  @Get()
  list() {
    return this.agents.listAgents();
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.agents.revokeAgent(id);
  }
}

@ApiTags('gym-access-sync')
@ApiBearerAuth()
@RequireModule('gym')
@Roles('owner', 'admin')
@UseGuards(...AdminGuards)
@Controller('gym/access/sync')
export class AccessSyncController {
  constructor(private readonly sync: AccessSyncService) {}

  @Get()
  list(@Query() query: SyncListQueryDto) {
    return this.sync.list(query);
  }

  @Get('summary')
  summary() {
    return this.sync.summary();
  }

  @Post('resync')
  resync(@Body() dto: ResyncDto) {
    return this.sync.resync(dto.gateId);
  }
}

@ApiTags('gym-access-agent')
@Controller('gym/access/agents')
export class AccessAgentEnrollController {
  constructor(private readonly agents: AccessAgentsService) {}

  @Post('enroll')
  @UseGuards(EnrollThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  enroll(@Body() dto: EnrollAgentDto) {
    return this.agents.enroll(dto);
  }
}

@ApiTags('gym-access-agent')
@ApiHeader({ name: 'Authorization', description: 'Agent <agentId>.<token>' })
@SkipThrottle()
@UseGuards(AgentAuthGuard)
@Controller('gym/access/agents')
export class AccessAgentController {
  constructor(private readonly agents: AccessAgentsService) {}

  @Get('work')
  work(@CurrentAgent() agent: AgentPrincipal, @Query() query: AgentWorkQueryDto) {
    return this.agents.work(agent, query.limit);
  }

  @Post('work/:id/ack')
  @HttpCode(200)
  ack(@CurrentAgent() agent: AgentPrincipal, @Param('id') id: string, @Body() dto: AgentAckDto) {
    return this.agents.ack(agent, id, dto);
  }

  @Post('events/batch')
  @HttpCode(200)
  events(@CurrentAgent() agent: AgentPrincipal, @Body() dto: AgentEventsBatchDto) {
    return this.agents.events(agent, dto);
  }

  @Post('heartbeat')
  @HttpCode(200)
  heartbeat(@CurrentAgent() agent: AgentPrincipal, @Body() dto: AgentHeartbeatDto) {
    return this.agents.heartbeat(agent, dto);
  }
}

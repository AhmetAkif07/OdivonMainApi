import { Module } from '@nestjs/common';
import { AccessAgentsService } from './access-agents.service';
import { AccessSyncService } from './access-sync.service';
import {
  AccessAgentController,
  AccessAgentEnrollController,
  AccessAgentsAdminController,
  AccessSyncController,
  EnrollThrottlerGuard,
} from './access.controllers';
import { AccessRepository } from './access.repository';
import { AgentAuthGuard } from './agent-auth.guard';

@Module({
  controllers: [
    AccessAgentEnrollController,
    AccessAgentController,
    AccessAgentsAdminController,
    AccessSyncController,
  ],
  providers: [AccessRepository, AccessSyncService, AccessAgentsService, AgentAuthGuard, EnrollThrottlerGuard],
  exports: [AccessSyncService, AccessAgentsService],
})
export class GymAccessModule {}

import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { TENANT_COLLECTION } from '../../shared/firebase/firestore-path';
import { ParkingAgentGuard } from './access/parking-agent.guard';
import { CurrentParkingAgent, ParkingAgentPrincipal } from './access/parking-agent-principal';
import { ParkingAgentService } from './access/parking-agent.service';
import {
  AgentAckDto, AgentEventsBatchDto, AgentHeartbeatDto, CloseCashShiftDto, CreateEntryDto,
  CreateFacilityDto, CreateLaneDto, CreatePairingCodeDto, CreatePaymentDto, CreateSlotDto,
  CreateTariffDto, CreateZoneDto, EnrollAgentDto, ExitSessionDto, LiveQueryDto, LostTicketDto,
  ManualOverrideDto, OpenCashShiftDto, ParkingListQueryDto, QuoteSessionDto, RefundPaymentDto,
  UpdateFacilityDto, UpdateLaneDto, UpdateSlotDto, UpdateTariffDto, UpdateZoneDto,
} from './parking.dto';
import { PARKING_ROLE_TEMPLATES } from './parking-role-templates';
import { ParkingService } from './parking.service';

@ApiTags('parking')
@ApiBearerAuth()
@RequireModule('parking')
@UseGuards(FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard, PermissionGuard)
@Controller('parking')
export class ParkingController {
  constructor(private readonly parking: ParkingService, private readonly agents: ParkingAgentService) {}

  @Get('dashboard') @RequirePermission('parkingDashboard', 'view') dashboard(@Query('facilityId') facilityId?: string) { return this.parking.dashboard(facilityId); }
  @Get('live') @RequirePermission('parkingDashboard', 'view') live(@Query() query: LiveQueryDto) { return this.parking.live(query); }
  @Get('roles/templates') @RequirePermission('parkingFacilities', 'view') roles() { return PARKING_ROLE_TEMPLATES; }
  @Post('pilot-seed') @RequirePermission('parkingFacilities', 'create') pilotSeed() { return this.parking.seedPilot(); }

  @Get('facilities') @RequirePermission('parkingFacilities', 'view') facilities(@Query() query: ParkingListQueryDto) { return this.parking.facilities(query); }
  @Post('facilities') @RequirePermission('parkingFacilities', 'create') createFacility(@Body() dto: CreateFacilityDto) { return this.parking.createFacility(dto); }
  @Patch('facilities/:id') @RequirePermission('parkingFacilities', 'update') updateFacility(@Param('id') id: string, @Body() dto: UpdateFacilityDto) { return this.parking.updateFacility(id, dto); }
  @Delete('facilities/:id') @RequirePermission('parkingFacilities', 'delete') deleteFacility(@Param('id') id: string) { return this.parking.softDelete(TENANT_COLLECTION.parkingFacilities, id); }

  @Get('zones') @RequirePermission('parkingFacilities', 'view') zones(@Query() query: ParkingListQueryDto) { return this.parking.zones(query); }
  @Post('zones') @RequirePermission('parkingFacilities', 'create') createZone(@Body() dto: CreateZoneDto) { return this.parking.createZone(dto); }
  @Patch('zones/:id') @RequirePermission('parkingFacilities', 'update') updateZone(@Param('id') id: string, @Body() dto: UpdateZoneDto) { return this.parking.updateZone(id, dto); }
  @Delete('zones/:id') @RequirePermission('parkingFacilities', 'delete') deleteZone(@Param('id') id: string) { return this.parking.softDelete(TENANT_COLLECTION.parkingZones, id); }

  @Get('slots') @RequirePermission('parkingFacilities', 'view') slots(@Query() query: ParkingListQueryDto) { return this.parking.slots(query); }
  @Post('slots') @RequirePermission('parkingFacilities', 'create') createSlot(@Body() dto: CreateSlotDto) { return this.parking.createSlot(dto); }
  @Patch('slots/:id') @RequirePermission('parkingFacilities', 'update') updateSlot(@Param('id') id: string, @Body() dto: UpdateSlotDto) { return this.parking.updateSlot(id, dto); }
  @Delete('slots/:id') @RequirePermission('parkingFacilities', 'delete') deleteSlot(@Param('id') id: string) { return this.parking.softDelete(TENANT_COLLECTION.parkingSlots, id); }

  @Get('lanes') @RequirePermission('parkingFacilities', 'view') lanes(@Query() query: ParkingListQueryDto) { return this.parking.lanes(query); }
  @Post('lanes') @RequirePermission('parkingFacilities', 'create') createLane(@Body() dto: CreateLaneDto) { return this.parking.createLane(dto); }
  @Patch('lanes/:id') @RequirePermission('parkingFacilities', 'update') updateLane(@Param('id') id: string, @Body() dto: UpdateLaneDto) { return this.parking.updateLane(id, dto); }
  @Delete('lanes/:id') @RequirePermission('parkingFacilities', 'delete') deleteLane(@Param('id') id: string) { return this.parking.softDelete(TENANT_COLLECTION.parkingLanes, id); }

  @Get('tariffs') @RequirePermission('parkingTariffs', 'view') tariffs(@Query() query: ParkingListQueryDto) { return this.parking.tariffs(query); }
  @Post('tariffs') @RequirePermission('parkingTariffs', 'create') createTariff(@Body() dto: CreateTariffDto) { return this.parking.createTariff(dto); }
  @Patch('tariffs/:id') @RequirePermission('parkingTariffs', 'update') updateTariff(@Param('id') id: string, @Body() dto: UpdateTariffDto) { return this.parking.updateTariff(id, dto); }
  @Delete('tariffs/:id') @RequirePermission('parkingTariffs', 'delete') deleteTariff(@Param('id') id: string) { return this.parking.softDelete(TENANT_COLLECTION.parkingTariffs, id); }

  @Get('sessions') @RequirePermission('parkingSessions', 'view') sessions(@Query() query: ParkingListQueryDto) { return this.parking.sessions(query); }
  @Post('entries') @RequirePermission('parkingSessions', 'create') createEntry(@Headers('idempotency-key') key: string, @Body() dto: CreateEntryDto) { return this.parking.createEntry(dto, key); }
  @Post('sessions/:id/quote') @RequirePermission('parkingSessions', 'update') quote(@Param('id') id: string, @Body() dto: QuoteSessionDto) { return this.parking.quoteSession(id, dto); }
  @Post('sessions/:id/lost-ticket') @RequirePermission('parkingSessions', 'update') lostTicket(@Param('id') id: string, @Body() dto: LostTicketDto) { return this.parking.markLostTicket(id, dto); }
  @Post('sessions/:id/exit') @RequirePermission('parkingSessions', 'update') exit(@Param('id') id: string, @Headers('idempotency-key') key: string, @Body() dto: ExitSessionDto) { return this.parking.exitSession(id, dto, key); }

  @Post('payments') @RequirePermission('parkingPayments', 'create') payment(@Headers('idempotency-key') key: string, @Body() dto: CreatePaymentDto) { return this.parking.createPayment(dto, key); }
  @Post('payments/:id/refund') @RequirePermission('parkingPayments', 'refund') refund(@Param('id') id: string, @Headers('idempotency-key') key: string, @Body() dto: RefundPaymentDto) { return this.parking.refundPayment(id, dto, key); }
  @Post('cash-shifts/open') @RequirePermission('parkingCash', 'create') openShift(@Body() dto: OpenCashShiftDto) { return this.parking.openCashShift(dto); }
  @Post('cash-shifts/:id/close') @RequirePermission('parkingCash', 'update') closeShift(@Param('id') id: string, @Body() dto: CloseCashShiftDto) { return this.parking.closeCashShift(id, dto); }
  @Post('manual-overrides') @RequirePermission('parkingDevices', 'approve') override(@Body() dto: ManualOverrideDto) { return this.parking.manualOverride(dto); }

  @Post('access/agents/pairing-codes') @RequirePermission('parkingDevices', 'create') pairing(@Body() dto: CreatePairingCodeDto) { return this.agents.pairingCode(dto); }
  @Get('access/agents') @RequirePermission('parkingDevices', 'view') listAgents() { return this.agents.list(); }
  @Delete('access/agents/:id') @RequirePermission('parkingDevices', 'delete') revokeAgent(@Param('id') id: string) { return this.agents.revoke(id); }
}

@ApiTags('parking-agent')
@Controller('parking/access/agents')
export class ParkingAgentEnrollController {
  constructor(private readonly agents: ParkingAgentService) {}
  @Post('enroll') enroll(@Body() dto: EnrollAgentDto) { return this.agents.enroll(dto); }
}

@ApiTags('parking-agent')
@ApiHeader({ name: 'Authorization', description: 'Agent <agentId>.<token>' })
@SkipThrottle()
@UseGuards(ParkingAgentGuard)
@Controller('parking/access/agents')
export class ParkingAgentController {
  constructor(private readonly agents: ParkingAgentService) {}
  @Get('work') work(@CurrentParkingAgent() agent: ParkingAgentPrincipal) { return this.agents.work(agent); }
  @Post('work/:id/ack') @HttpCode(200) ack(@CurrentParkingAgent() agent: ParkingAgentPrincipal, @Param('id') id: string, @Body() dto: AgentAckDto) { return this.agents.ack(agent, id, dto); }
  @Post('events/batch') @HttpCode(200) events(@CurrentParkingAgent() agent: ParkingAgentPrincipal, @Body() dto: AgentEventsBatchDto) { return this.agents.events(agent, dto); }
  @Post('heartbeat') @HttpCode(200) heartbeat(@CurrentParkingAgent() agent: ParkingAgentPrincipal, @Body() dto: AgentHeartbeatDto) { return this.agents.heartbeat(agent, dto); }
}


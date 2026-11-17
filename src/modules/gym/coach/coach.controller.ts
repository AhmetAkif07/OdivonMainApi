import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { RegisterDeviceDto, UnregisterDeviceDto } from '../mobile/mobile.dto';
import { ResolveProgramRequestDto } from '../ops/program-request.dto';
import { CoachMembersQueryDto, CoachRequestsQueryDto, CoachSessionsQueryDto } from './coach.dto';
import { GymCoachService } from './coach.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard] as const;

/**
 * Trainer mode of the gym app (and the panel's training tab): who is in the gym, what they are
 * training, their program progress and their requests. Programs and measurements are written
 * through `/gym/workouts` and `/gym/measurements`.
 */
@ApiTags('gym-coach')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/coach')
export class GymCoachController {
  constructor(private readonly coach: GymCoachService) {}

  @Get('me')
  @RequirePermission('workouts', 'view')
  me() {
    return this.coach.me();
  }

  @Get('floor')
  @RequirePermission('members', 'view')
  floor() {
    return this.coach.floor();
  }

  @Get('members')
  @RequirePermission('members', 'view')
  members(@Query() query: CoachMembersQueryDto) {
    return this.coach.listMembers(query);
  }

  @Get('members/:id')
  @RequirePermission('members', 'view')
  member(@Param('id') id: string) {
    return this.coach.memberDetail(id);
  }

  @Get('members/:id/sessions')
  @RequirePermission('workouts', 'view')
  memberSessions(@Param('id') id: string, @Query() query: CoachSessionsQueryDto) {
    return this.coach.memberSessions(id, query);
  }

  @Get('sessions/:id')
  @RequirePermission('workouts', 'view')
  session(@Param('id') id: string) {
    return this.coach.session(id);
  }

  @Get('requests')
  @RequirePermission('workouts', 'view')
  requests(@Query() query: CoachRequestsQueryDto) {
    return this.coach.listRequests(query);
  }

  @Patch('requests/:id')
  @RequirePermission('workouts', 'update')
  resolveRequest(@Param('id') id: string, @Body() dto: ResolveProgramRequestDto) {
    return this.coach.resolveRequest(id, dto);
  }

  @Post('devices')
  @RequirePermission('workouts', 'view')
  registerDevice(@Body() dto: RegisterDeviceDto) {
    return this.coach.registerDevice(dto);
  }

  @Post('devices/remove')
  @RequirePermission('workouts', 'view')
  unregisterDevice(@Body() dto: UnregisterDeviceDto) {
    return this.coach.unregisterDevice(dto.token);
  }
}

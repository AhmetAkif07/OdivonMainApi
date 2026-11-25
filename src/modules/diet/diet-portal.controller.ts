import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { DietMemberGuard } from './diet-access.guards';
import { DietPortalService } from './diet-portal.service';
import {
  CompleteDietPortalTaskDto,
  CreateDietMeasurementDto,
  CreateDietPortalRequestDto,
  ListDietMessagesQueryDto,
  SendDietMessageDto,
} from './diet.dto';

/**
 * OdivonDiet client ("danışan") portal, used by the web portal and the mobile app. Every route is
 * scoped to the signed-in member's own client record (paths match the web app's PORTAL_API).
 */
@ApiTags('diet-portal')
@ApiBearerAuth()
@RequireModule('diet')
@UseGuards(
  FirebaseAppCheckGuard,
  FirebaseAuthGuard,
  TenantGuard,
  EmailVerifiedGuard,
  SubscriptionGuard,
  ModuleGuard,
  DietMemberGuard,
)
@Controller('diet/portal')
export class DietPortalController {
  constructor(private readonly portal: DietPortalService) {}

  @Get('me')
  @ApiOperation({ summary: 'Danışan ana ekranı: profil, aktif plan, sıradaki görüşme, okunmamış mesaj' })
  me() {
    return this.portal.me();
  }

  @Get('plans')
  plans() {
    return this.portal.plans();
  }

  @Get('measurements')
  measurements() {
    return this.portal.measurements();
  }

  @Post('measurements')
  @ApiOperation({ summary: 'Danışanın evde girdiği tartı / ölçüm' })
  addMeasurement(@Body() dto: CreateDietMeasurementDto) {
    return this.portal.addMeasurement(dto);
  }

  @Get('consultations')
  consultations() {
    return this.portal.consultations();
  }

  @Get('messages')
  messages(@Query() query: ListDietMessagesQueryDto) {
    return this.portal.messages(query);
  }

  @Post('messages')
  sendMessage(@Body() dto: SendDietMessageDto) {
    return this.portal.sendMessage(dto);
  }

  @Post('messages/read') @HttpCode(200)
  markRead() {
    return this.portal.markRead();
  }

  @Get('tasks')
  tasks() {
    return this.portal.tasks();
  }

  @Post('tasks/:id/complete') @HttpCode(200)
  completeTask(@Param('id') id: string, @Body() dto: CompleteDietPortalTaskDto) {
    return this.portal.completeTask(id, dto);
  }

  @Get('requests')
  requests() {
    return this.portal.requests();
  }

  @Post('requests')
  createRequest(@Body() dto: CreateDietPortalRequestDto) {
    return this.portal.createRequest(dto);
  }

  @Post('consent') @HttpCode(200)
  @ApiOperation({ summary: 'KVKK açık rıza onayı' })
  consent() {
    return this.portal.giveConsent();
  }
}

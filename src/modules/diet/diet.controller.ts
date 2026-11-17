import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { SubscriptionGuard } from '../../shared/authorization/subscription.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { DIET_ROLE_TEMPLATES } from './diet.constants';
import {
  CreateDietClientDto,
  CreateDietConsultationDto,
  CreateDietMeasurementDto,
  CreateDietPlanDto,
  CreateDietRequestDto,
  CreateDietTaskDto,
  ListDietClientsQueryDto,
  ListDietConsultationsQueryDto,
  ListDietMessagesQueryDto,
  ListDietPlansQueryDto,
  ListDietRequestsQueryDto,
  ListDietTasksQueryDto,
  RegisterDietDeviceDto,
  SendDietMessageDto,
  UnregisterDietDeviceDto,
  UpdateDietClientDto,
  UpdateDietConsultationDto,
  UpdateDietNotificationPrefsDto,
  UpdateDietPlanDto,
  UpdateDietRequestDto,
  UpdateDietTaskDto,
} from './diet.dto';
import { DietService } from './diet.service';

/**
 * OdivonDiet staff API (dietitian / clinic manager), shared by the Angular panel and the mobile app.
 * The tenant owner ("Klinik Yöneticisi") passes every permission check.
 */
@ApiTags('diet')
@ApiBearerAuth()
@RequireModule('diet')
@UseGuards(
  FirebaseAppCheckGuard,
  FirebaseAuthGuard,
  TenantGuard,
  EmailVerifiedGuard,
  SubscriptionGuard,
  ModuleGuard,
  PermissionGuard,
)
@Controller('diet')
export class DietController {
  constructor(private readonly service: DietService) {}

  @Get('roles/templates')
  @ApiOperation({ summary: 'Diyetisyen, asistan ve ön büro rol şablonları' })
  roleTemplates() {
    return DIET_ROLE_TEMPLATES;
  }

  // ---------- dashboards ----------

  @Get('dashboard')
  @RequirePermission('dietClients', 'view')
  @ApiOperation({ summary: 'Bugün ekranı: günün görüşmeleri, KPI ve ilgilenilmesi gereken danışanlar' })
  dashboard() {
    return this.service.dashboard();
  }

  @Get('admin/summary')
  @RequirePermission('dietReports', 'view')
  @ApiOperation({ summary: 'Klinik yöneticisi özeti: diyetisyen bazında yük, büyüme' })
  adminSummary() {
    return this.service.adminSummary();
  }

  // ---------- clients ----------

  @Get('clients') @RequirePermission('dietClients', 'view')
  listClients(@Query() query: ListDietClientsQueryDto) {
    return this.service.listClients(query);
  }

  @Post('clients') @RequirePermission('dietClients', 'create')
  createClient(@Body() dto: CreateDietClientDto) {
    return this.service.createClient(dto);
  }

  @Get('clients/:id') @RequirePermission('dietClients', 'view')
  getClient(@Param('id') id: string) {
    return this.service.getClient(id);
  }

  @Get('clients/:id/overview')
  @RequirePermission('dietClients', 'view')
  @ApiOperation({ summary: 'Danışan detay ekranı: son ölçümler, aktif plan, görüşmeler, açık görevler' })
  clientOverview(@Param('id') id: string) {
    return this.service.clientOverview(id);
  }

  @Patch('clients/:id') @RequirePermission('dietClients', 'update')
  updateClient(@Param('id') id: string, @Body() dto: UpdateDietClientDto) {
    return this.service.updateClient(id, dto);
  }

  @Delete('clients/:id') @RequirePermission('dietClients', 'delete')
  deleteClient(@Param('id') id: string) {
    return this.service.deleteClient(id);
  }

  // ---------- measurements ----------

  @Get('clients/:id/measurements') @RequirePermission('dietClinical', 'view')
  listMeasurements(@Param('id') id: string) {
    return this.service.listMeasurements(id);
  }

  @Post('clients/:id/measurements') @RequirePermission('dietClinical', 'create')
  addMeasurement(@Param('id') id: string, @Body() dto: CreateDietMeasurementDto) {
    return this.service.addMeasurement(id, dto);
  }

  @Delete('measurements/:id') @RequirePermission('dietClinical', 'delete')
  deleteMeasurement(@Param('id') id: string) {
    return this.service.deleteMeasurement(id);
  }

  // ---------- consultations ----------

  @Get('consultations') @RequirePermission('dietSchedule', 'view')
  listConsultations(@Query() query: ListDietConsultationsQueryDto) {
    return this.service.listConsultations(query);
  }

  @Post('consultations') @RequirePermission('dietSchedule', 'create')
  createConsultation(@Body() dto: CreateDietConsultationDto) {
    return this.service.createConsultation(dto);
  }

  @Patch('consultations/:id') @RequirePermission('dietSchedule', 'update')
  updateConsultation(@Param('id') id: string, @Body() dto: UpdateDietConsultationDto) {
    return this.service.updateConsultation(id, dto);
  }

  @Delete('consultations/:id') @RequirePermission('dietSchedule', 'delete')
  deleteConsultation(@Param('id') id: string) {
    return this.service.deleteConsultation(id);
  }

  // ---------- plans ----------

  @Get('plans') @RequirePermission('dietClinical', 'view')
  listPlans(@Query() query: ListDietPlansQueryDto) {
    return this.service.listPlans(query);
  }

  @Get('plans/:id') @RequirePermission('dietClinical', 'view')
  getPlan(@Param('id') id: string) {
    return this.service.getPlan(id);
  }

  @Post('plans') @RequirePermission('dietClinical', 'create')
  createPlan(@Body() dto: CreateDietPlanDto) {
    return this.service.createPlan(dto);
  }

  @Patch('plans/:id') @RequirePermission('dietClinical', 'update')
  updatePlan(@Param('id') id: string, @Body() dto: UpdateDietPlanDto) {
    return this.service.updatePlan(id, dto);
  }

  @Delete('plans/:id') @RequirePermission('dietClinical', 'delete')
  deletePlan(@Param('id') id: string) {
    return this.service.deletePlan(id);
  }

  // ---------- conversations (paths match the web app's PORTAL_API) ----------

  @Get('conversations') @RequirePermission('dietMessages', 'view')
  listConversations() {
    return this.service.listConversations();
  }

  @Get('conversations/:clientId/messages') @RequirePermission('dietMessages', 'view')
  listMessages(@Param('clientId') clientId: string, @Query() query: ListDietMessagesQueryDto) {
    return this.service.listMessages(clientId, query);
  }

  @Post('conversations/:clientId/messages') @RequirePermission('dietMessages', 'create')
  sendMessage(@Param('clientId') clientId: string, @Body() dto: SendDietMessageDto) {
    return this.service.sendMessage(clientId, dto);
  }

  @Post('conversations/:clientId/read') @HttpCode(200) @RequirePermission('dietMessages', 'view')
  markRead(@Param('clientId') clientId: string) {
    return this.service.markConversationRead(clientId);
  }

  // ---------- tasks ----------

  @Get('tasks') @RequirePermission('dietMessages', 'view')
  listTasks(@Query() query: ListDietTasksQueryDto) {
    return this.service.listTasks(query);
  }

  @Get('clients/:id/tasks') @RequirePermission('dietMessages', 'view')
  listClientTasks(@Param('id') id: string, @Query() query: ListDietTasksQueryDto) {
    return this.service.listTasks({ ...query, clientId: id });
  }

  @Post('clients/:id/tasks') @RequirePermission('dietMessages', 'create')
  createTask(@Param('id') id: string, @Body() dto: CreateDietTaskDto) {
    return this.service.createTask(id, dto);
  }

  @Patch('tasks/:id') @RequirePermission('dietMessages', 'update')
  updateTask(@Param('id') id: string, @Body() dto: UpdateDietTaskDto) {
    return this.service.updateTask(id, dto);
  }

  @Delete('tasks/:id') @RequirePermission('dietMessages', 'delete')
  deleteTask(@Param('id') id: string) {
    return this.service.deleteTask(id);
  }

  // ---------- requests ----------

  @Get('requests') @RequirePermission('dietMessages', 'view')
  listRequests(@Query() query: ListDietRequestsQueryDto) {
    return this.service.listRequests(query);
  }

  @Post('requests') @RequirePermission('dietMessages', 'create')
  createRequest(@Body() dto: CreateDietRequestDto) {
    return this.service.createRequest(dto);
  }

  @Patch('requests/:id') @RequirePermission('dietMessages', 'update')
  updateRequest(@Param('id') id: string, @Body() dto: UpdateDietRequestDto) {
    return this.service.updateRequest(id, dto);
  }

  // ---------- devices & notification preferences (any signed-in staff member) ----------

  @Post('devices')
  @ApiOperation({ summary: 'Mobil push token kaydı' })
  registerDevice(@Body() dto: RegisterDietDeviceDto) {
    return this.service.registerDevice(dto);
  }

  @Post('devices/unregister') @HttpCode(200)
  unregisterDevice(@Body() dto: UnregisterDietDeviceDto) {
    return this.service.unregisterDevice(dto.token);
  }

  @Get('notification-preferences')
  notificationPrefs() {
    return this.service.notificationPrefs();
  }

  @Put('notification-preferences')
  updateNotificationPrefs(@Body() dto: UpdateDietNotificationPrefsDto) {
    return this.service.updateNotificationPrefs(dto);
  }
}

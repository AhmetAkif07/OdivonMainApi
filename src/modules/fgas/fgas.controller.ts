import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { FirebaseAppCheckGuard } from '../../shared/auth/firebase-app-check.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { FGAS_ROLE_TEMPLATES } from './fgas.constants';
import {
  CompleteFgasOnboardingDto,
  CreateFgasOperationDto,
  CreateFgasRecordDto,
  FGAS_OPERATION_KINDS,
  FgasListQueryDto,
  FgasOperationListQueryDto,
  UpdateFgasOperationDto,
  UpdateFgasRecordDto,
} from './fgas.dto';
import { FgasOperationKind } from './fgas.types';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FgasService } from './fgas.service';

@ApiTags('fgas')
@ApiBearerAuth()
@RequireModule('fgas')
@UseGuards(
  FirebaseAppCheckGuard,
  FirebaseAuthGuard,
  TenantGuard,
  EmailVerifiedGuard,
  ModuleGuard,
  PermissionGuard,
)
@Controller('fgas')
export class FgasController {
  constructor(private readonly service: FgasService) {}
  @Get('roles/templates') @RequirePermission('fgasRecords', 'view') roleTemplates() {
    return FGAS_ROLE_TEMPLATES;
  }
  @Get('dashboard') @RequirePermission('fgasRecords', 'view') dashboard() {
    return this.service.dashboard();
  }
  @Get('audit') @RequirePermission('fgasRecords', 'view') allAudit(@Query('limit') limit?: string) {
    return this.service.allAudit(Number(limit) || 100);
  }
  @Post('onboarding/complete') @RequirePermission('fgasRecords', 'update') completeOnboarding(
    @Body() dto: CompleteFgasOnboardingDto,
  ) {
    return this.service.completeOnboarding(dto);
  }
  @Get('reports/compliance') @RequirePermission('fgasRecords', 'export') complianceReport(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.complianceReport(from, to);
  }
  @Get('entitlements') @RequirePermission('fgasRecords', 'view') entitlements() {
    return this.service.entitlements();
  }
  @Get('records')
  @RequirePermission('fgasRecords', 'view')
  @ApiOperation({ summary: 'List tenant F-Gas records' })
  list(@Query() query: FgasListQueryDto) {
    return this.service.list(query);
  }
  @Get('records/:id/audit') @RequirePermission('fgasRecords', 'view') audit(
    @Param('id') id: string,
  ) {
    return this.service.audit(id);
  }
  @Get('records/:id') @RequirePermission('fgasRecords', 'view') get(@Param('id') id: string) {
    return this.service.get(id);
  }
  @Post('records') @RequirePermission('fgasRecords', 'create') create(
    @Body() dto: CreateFgasRecordDto,
  ) {
    return this.service.create(dto);
  }
  @Patch('records/:id') @RequirePermission('fgasRecords', 'update') update(
    @Param('id') id: string,
    @Body() dto: UpdateFgasRecordDto,
  ) {
    return this.service.update(id, dto);
  }
  @Delete('records/:id') @RequirePermission('fgasRecords', 'delete') archive(
    @Param('id') id: string,
  ) {
    return this.service.archive(id);
  }
  @Post('records/:id/restore') @RequirePermission('fgasRecords', 'delete') restore(
    @Param('id') id: string,
  ) {
    return this.service.restore(id);
  }
  @Get('operations/:kind') @RequirePermission('fgasRecords', 'view') listOperations(
    @Param('kind') kind: string,
    @Query() query: FgasOperationListQueryDto,
  ) {
    return this.service.listOperations(this.kind(kind), query);
  }
  @Get('operations/:kind/:id') @RequirePermission('fgasRecords', 'view') getOperation(
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.service.getOperation(this.kind(kind), id);
  }
  @Post('operations/:kind') @RequirePermission('fgasRecords', 'create') createOperation(
    @Param('kind') kind: string,
    @Body() dto: CreateFgasOperationDto,
  ) {
    return this.service.createOperation(this.kind(kind), dto);
  }
  @Patch('operations/:kind/:id') @RequirePermission('fgasRecords', 'update') updateOperation(
    @Param('kind') kind: string,
    @Param('id') id: string,
    @Body() dto: UpdateFgasOperationDto,
  ) {
    return this.service.updateOperation(this.kind(kind), id, dto);
  }
  @Delete('operations/:kind/:id') @RequirePermission('fgasRecords', 'delete') archiveOperation(
    @Param('kind') kind: string,
    @Param('id') id: string,
  ) {
    return this.service.archiveOperation(this.kind(kind), id);
  }
  @Post('operations/:kind/:id/restore')
  @RequirePermission('fgasRecords', 'delete')
  restoreOperation(@Param('kind') kind: string, @Param('id') id: string) {
    return this.service.restoreOperation(this.kind(kind), id);
  }
  private kind(value: string): FgasOperationKind {
    if (!(FGAS_OPERATION_KINDS as readonly string[]).includes(value))
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Desteklenmeyen F-Gas operasyon türü.');
    return value as FgasOperationKind;
  }
}

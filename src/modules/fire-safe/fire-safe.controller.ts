import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { FIRE_SAFE_ROLE_TEMPLATES } from './fire-safe.constants';
import { CreateFireSafeRecordDto, FireSafeListQueryDto, UpdateFireSafeRecordDto } from './fire-safe.dto';
import { FireSafeService } from './fire-safe.service';

@ApiTags('fire-safe')
@ApiBearerAuth()
@RequireModule('fire-safe')
@UseGuards(FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard, PermissionGuard)
@Controller('fire-safe')
export class FireSafeController {
  constructor(private readonly service: FireSafeService) {}
  @Get('roles/templates') @RequirePermission('fireSafeRecords', 'view') roleTemplates() { return FIRE_SAFE_ROLE_TEMPLATES; }
  @Get('records') @RequirePermission('fireSafeRecords', 'view') @ApiOperation({ summary: 'List tenant Yangın güvenliği records' }) list(@Query() query: FireSafeListQueryDto) { return this.service.list(query); }
  @Get('records/:id') @RequirePermission('fireSafeRecords', 'view') get(@Param('id') id: string) { return this.service.get(id); }
  @Post('records') @RequirePermission('fireSafeRecords', 'create') create(@Body() dto: CreateFireSafeRecordDto) { return this.service.create(dto); }
  @Patch('records/:id') @RequirePermission('fireSafeRecords', 'update') update(@Param('id') id: string, @Body() dto: UpdateFireSafeRecordDto) { return this.service.update(id, dto); }
  @Delete('records/:id') @RequirePermission('fireSafeRecords', 'delete') archive(@Param('id') id: string) { return this.service.archive(id); }
  @Post('records/:id/restore') @RequirePermission('fireSafeRecords', 'delete') restore(@Param('id') id: string) { return this.service.restore(id); }
}

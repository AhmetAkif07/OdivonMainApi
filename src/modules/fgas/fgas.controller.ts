import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { FGAS_ROLE_TEMPLATES } from './fgas.constants';
import { CreateFgasRecordDto, FgasListQueryDto, UpdateFgasRecordDto } from './fgas.dto';
import { FgasService } from './fgas.service';

@ApiTags('fgas')
@ApiBearerAuth()
@RequireModule('fgas')
@UseGuards(FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard, PermissionGuard)
@Controller('fgas')
export class FgasController {
  constructor(private readonly service: FgasService) {}
  @Get('roles/templates') @RequirePermission('fgasRecords', 'view') roleTemplates() { return FGAS_ROLE_TEMPLATES; }
  @Get('records') @RequirePermission('fgasRecords', 'view') @ApiOperation({ summary: 'List tenant F-Gas records' }) list(@Query() query: FgasListQueryDto) { return this.service.list(query); }
  @Get('records/:id') @RequirePermission('fgasRecords', 'view') get(@Param('id') id: string) { return this.service.get(id); }
  @Post('records') @RequirePermission('fgasRecords', 'create') create(@Body() dto: CreateFgasRecordDto) { return this.service.create(dto); }
  @Patch('records/:id') @RequirePermission('fgasRecords', 'update') update(@Param('id') id: string, @Body() dto: UpdateFgasRecordDto) { return this.service.update(id, dto); }
  @Delete('records/:id') @RequirePermission('fgasRecords', 'delete') archive(@Param('id') id: string) { return this.service.archive(id); }
  @Post('records/:id/restore') @RequirePermission('fgasRecords', 'delete') restore(@Param('id') id: string) { return this.service.restore(id); }
}

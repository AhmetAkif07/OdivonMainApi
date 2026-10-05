import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CrmService } from './crm.service';
import { CreateCommunicationLogDto } from './dto/create-communication-log.dto';
import { ListCommunicationLogsQueryDto } from './dto/list-communication-logs.query.dto';

@ApiTags('vet-crm')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/crm')
export class CrmController {
  constructor(private readonly service: CrmService) {}

  @Get('logs')
  @RequirePermission('crm', 'view')
  @ApiOperation({ summary: 'List SMS & WhatsApp communication logs' })
  listLogs(@Query() query: ListCommunicationLogsQueryDto) {
    return this.service.listLogs(query);
  }

  @Post('logs')
  @RequirePermission('crm', 'create')
  @ApiOperation({ summary: 'Log a sent or outgoing communication message' })
  createLog(@Body() dto: CreateCommunicationLogDto) {
    return this.service.createLog(dto);
  }

  @Get('reminder-candidates')
  @RequirePermission('crm', 'view')
  @ApiOperation({ summary: 'Get upcoming & overdue vaccine and appointment reminder candidates' })
  getReminderCandidates() {
    return this.service.getReminderCandidates();
  }

  @Get('petvet/summary')
  @RequirePermission('crm', 'view')
  @ApiOperation({ summary: 'Get PETVET microchip compliance summary and non-compliant patients' })
  getPetVetSummary() {
    return this.service.getPetVetSummary();
  }

  @Get('petvet/export')
  @RequirePermission('crm', 'view')
  @ApiOperation({ summary: 'Export ministry-ready PETVET microchip data' })
  getPetVetExportData() {
    return this.service.getPetVetExportData();
  }
}

import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import {
  CashSessionQueryDto,
  CloseCashSessionDto,
  CurrentCashSessionQueryDto,
  OpenCashSessionDto,
} from './cash-session.dto';
import { CashSessionsService } from './cash-sessions.service';

@ApiTags('vet-cash-sessions')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/cash-sessions')
export class CashSessionsController {
  constructor(private readonly service: CashSessionsService) {}

  @Get()
  @RequirePermission('cashSessions', 'view')
  list(@Query() query: CashSessionQueryDto) {
    return this.service.list(query);
  }

  @Get('current')
  @ApiOperation({ summary: 'Open session of a register with live totals (X report), or null' })
  @RequirePermission('cashSessions', 'view')
  current(@Query() query: CurrentCashSessionQueryDto) {
    return this.service.current(query.cashRegisterId);
  }

  @Post('open')
  @ApiOperation({ summary: 'Open the till with a starting cash amount' })
  @RequirePermission('cashSessions', 'create')
  open(@Body() dto: OpenCashSessionDto) {
    return this.service.open(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Session with its X report (open) or Z report (closed)' })
  @RequirePermission('cashSessions', 'view')
  get(@Param('id') id: string) {
    return this.service.report(id);
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Close the till: counted cash vs expected, freezes the Z report' })
  @RequirePermission('cashSessions', 'update')
  close(@Param('id') id: string, @Body() dto: CloseCashSessionDto) {
    return this.service.close(id, dto);
  }
}

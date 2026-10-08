import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { StockLedgerService } from './stock-ledger.service';

@ApiTags('vet-stock-balances')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/stock-balances')
export class StockBalancesController {
  constructor(private readonly ledger: StockLedgerService) {}

  @Get('expiry-report')
  @RequirePermission('stockMovements', 'view')
  @ApiOperation({ summary: 'Get expiration date / SKT tracking report' })
  getExpiryReport() {
    return this.ledger.getExpiryReport();
  }

  @Post('import-invoice')
  @RequirePermission('stockMovements', 'create')
  @ApiOperation({ summary: 'Import warehouse XML e-invoice and update stock' })
  importInvoice(@Body() payload: any) {
    return this.ledger.importInvoice(payload);
  }

  @Get()
  @RequirePermission('stockMovements', 'view')
  @ApiOperation({ summary: 'List stock balances across stores' })
  list(@Query() query: PagingQueryDto) {
    return this.ledger.listBalances(query);
  }
}
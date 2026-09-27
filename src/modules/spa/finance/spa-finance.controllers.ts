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
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { SpaGuards } from '../shared/spa-guards';
import { SpaListQueryDto } from '../shared/spa-list.dto';
import { SpaStore } from '../shared/spa-store';
import {
  CreateSpaCommissionRuleDto,
  CreateSpaExpenseDto,
  CreateSpaPaymentDto,
  PayoutCommissionsDto,
  RefundSpaPaymentDto,
  ReopenCashRegisterDayDto,
  UpdateSpaCommissionRuleDto,
  UpdateSpaExpenseDto,
} from './finance.dto';
import { SpaFinanceService } from './spa-finance.service';

const EXPENSE_NOT_FOUND = 'Gider kaydı bulunamadı.';

@ApiTags('spa-finance')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/payments')
export class SpaPaymentsController {
  constructor(
    private readonly store: SpaStore,
    private readonly finance: SpaFinanceService,
  ) {}

  @Get()
  @RequirePermission('spaPayments', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.store.list(TENANT_COLLECTION.spaPayments, {
      dateField: 'createdAt',
      from: query.from,
      to: query.to,
      equals: { customerId: query.customerId },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
    });
  }

  @Post()
  @RequirePermission('spaPayments', 'create')
  create(@Body() dto: CreateSpaPaymentDto) {
    return this.finance.createPayment(dto);
  }

  @Post(':id/refund')
  @RequirePermission('spaPayments', 'update')
  refund(@Param('id') id: string, @Body() dto: RefundSpaPaymentDto) {
    return this.finance.refundPayment(id, dto.reason);
  }
}

@ApiTags('spa-finance')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/expenses')
export class SpaExpensesController {
  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaExpenses', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.store.list(TENANT_COLLECTION.spaExpenses, {
      dateField: 'date',
      from: query.from,
      to: query.to,
      equals: { staffId: query.staffId },
      orderBy: { field: 'date', dir: 'desc' },
      limit: query.limit,
    });
  }

  @Post()
  @RequirePermission('spaExpenses', 'create')
  create(@Body() dto: CreateSpaExpenseDto) {
    return this.store.create(TENANT_COLLECTION.spaExpenses, 'expenses', dto);
  }

  @Patch(':id')
  @RequirePermission('spaExpenses', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSpaExpenseDto) {
    return this.store.update(TENANT_COLLECTION.spaExpenses, 'expenses', id, dto, EXPENSE_NOT_FOUND);
  }

  @Delete(':id')
  @RequirePermission('spaExpenses', 'delete')
  remove(@Param('id') id: string) {
    return this.store.softDelete(TENANT_COLLECTION.spaExpenses, 'expenses', id, EXPENSE_NOT_FOUND);
  }
}

@ApiTags('spa-finance')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/cash-register-days')
export class SpaCashRegisterController {
  constructor(private readonly finance: SpaFinanceService) {}

  @Get()
  @RequirePermission('spaCashRegister', 'view')
  @ApiOperation({ summary: 'Cash register days with from <= date <= to (YYYY-MM-DD)' })
  list(@Query() query: SpaListQueryDto) {
    return this.finance.listCashDays(query.from, query.to);
  }

  @Get(':date')
  @RequirePermission('spaCashRegister', 'view')
  get(@Param('date') date: string) {
    return this.finance.getCashDay(date);
  }

  @Post(':date/close')
  @RequirePermission('spaCashRegister', 'create')
  close(@Param('date') date: string) {
    return this.finance.closeCashDay(date);
  }

  @Post(':date/reopen')
  @RequirePermission('spaCashRegister', 'update')
  reopen(@Param('date') date: string, @Body() dto: ReopenCashRegisterDayDto) {
    return this.finance.reopenCashDay(date, dto.reason);
  }
}

@ApiTags('spa-finance')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/commissions')
export class SpaCommissionsController {
  constructor(
    private readonly store: SpaStore,
    private readonly finance: SpaFinanceService,
  ) {}

  @Get('rules')
  @RequirePermission('spaCommissions', 'view')
  rules() {
    return this.finance.listRules();
  }

  @Post('rules')
  @RequirePermission('spaCommissions', 'create')
  createRule(@Body() dto: CreateSpaCommissionRuleDto) {
    return this.finance.createRule(dto);
  }

  @Patch('rules/:id')
  @RequirePermission('spaCommissions', 'update')
  updateRule(@Param('id') id: string, @Body() dto: UpdateSpaCommissionRuleDto) {
    return this.finance.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission('spaCommissions', 'delete')
  removeRule(@Param('id') id: string) {
    return this.finance.removeRule(id);
  }

  @Get('accruals')
  @RequirePermission('spaCommissions', 'view')
  accruals(@Query() query: SpaListQueryDto) {
    return this.finance.listAccruals(query);
  }

  @Get('accruals/mine')
  @ApiOperation({ summary: "The caller's own commission accruals (any spa staff member)" })
  myAccruals(@Query() query: SpaListQueryDto) {
    return this.finance.listAccruals({ ...query, staffId: this.store.userId() });
  }

  @Post('payout')
  @RequirePermission('spaCommissions', 'update')
  payout(@Body() dto: PayoutCommissionsDto) {
    return this.finance.payout(dto);
  }
}

@ApiTags('spa-audit')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/audit-logs')
export class SpaAuditLogsController {
  constructor(private readonly store: SpaStore) {}

  @Get()
  @RequirePermission('spaAudit', 'view')
  list(@Query() query: SpaListQueryDto) {
    return this.store.list(TENANT_COLLECTION.spaAuditLogs, {
      dateField: 'createdAt',
      from: query.from,
      to: query.to,
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit ?? 200,
    });
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import {
  CashRegisterQueryDto,
  CloseCashRegisterDto,
  CountCashRegisterDto,
  CreateHairCommissionRuleDto,
  CreateHairExpenseDto,
  CreateHairPaymentDto,
  OpenCashRegisterDto,
  PayoutCommissionsDto,
  UpdateHairCommissionRuleDto,
  UpdateHairExpenseDto,
} from './finance.dto';
import { HairFinanceService } from './hair-finance.service';

@ApiTags('hair-finance')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/payments')
export class HairPaymentsController {
  constructor(private readonly finance: HairFinanceService) {}

  @Get()
  @RequirePermission('hairPayments', 'view')
  @ApiOperation({ summary: 'Payments with from <= date <= to (YYYY-MM-DD); branchId, customerId, staffId, type (= method)' })
  list(@Query() query: HairListQueryDto) {
    return this.finance.listPayments(query);
  }

  @Get(':id')
  @RequirePermission('hairPayments', 'view')
  get(@Param('id') id: string) {
    return this.finance.getPayment(id);
  }

  @Post()
  @RequirePermission('hairPayments', 'create')
  @ApiOperation({ summary: 'Manual payment outside POS' })
  create(@Body() dto: CreateHairPaymentDto) {
    return this.finance.createPayment(dto);
  }
}

@ApiTags('hair-finance')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/expenses')
export class HairExpensesController {
  constructor(private readonly finance: HairFinanceService) {}

  @Get()
  @RequirePermission('hairExpenses', 'view')
  @ApiOperation({ summary: 'Expenses with from <= date <= to; branchId, categoryId (= category), type (= method), search' })
  list(@Query() query: HairListQueryDto) {
    return this.finance.listExpenses(query);
  }

  @Post()
  @RequirePermission('hairExpenses', 'create')
  create(@Body() dto: CreateHairExpenseDto) {
    return this.finance.createExpense(dto);
  }

  @Patch(':id')
  @RequirePermission('hairExpenses', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairExpenseDto) {
    return this.finance.updateExpense(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairExpenses', 'delete')
  remove(@Param('id') id: string) {
    return this.finance.removeExpense(id);
  }
}

@ApiTags('hair-finance')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/cash-register')
export class HairCashRegisterController {
  constructor(private readonly finance: HairFinanceService) {}

  @Get('today')
  @RequirePermission('hairCashRegister', 'view')
  @ApiOperation({ summary: "Branch register of today (or ?date=) with live totals and expected closing" })
  today(@Query() query: CashRegisterQueryDto) {
    return this.finance.cashRegisterDay(query);
  }

  @Post('open')
  @RequirePermission('hairCashRegister', 'create')
  open(@Body() dto: OpenCashRegisterDto) {
    return this.finance.openRegister(dto);
  }

  @Post('close')
  @RequirePermission('hairCashRegister', 'create')
  close(@Body() dto: CloseCashRegisterDto) {
    return this.finance.closeRegister(dto);
  }

  @Post('count')
  @RequirePermission('hairCashRegister', 'create')
  @ApiOperation({ summary: 'Record a physical cash count (K-004)' })
  count(@Body() dto: CountCashRegisterDto) {
    return this.finance.countRegister(dto);
  }
}

@ApiTags('hair-finance')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/commissions')
export class HairCommissionsController {
  constructor(private readonly finance: HairFinanceService) {}

  @Get()
  @RequirePermission('hairCommissions', 'view')
  @ApiOperation({ summary: 'Commissions with from <= date <= to; staffId, status (= payoutStatus), branchId' })
  list(@Query() query: HairListQueryDto) {
    return this.finance.listCommissions(query);
  }

  @Get('rules')
  @RequirePermission('hairCommissions', 'view')
  rules() {
    return this.finance.listRules();
  }

  @Post('rules')
  @RequirePermission('hairCommissions', 'create')
  createRule(@Body() dto: CreateHairCommissionRuleDto) {
    return this.finance.createRule(dto);
  }

  @Patch('rules/:id')
  @RequirePermission('hairCommissions', 'update')
  updateRule(@Param('id') id: string, @Body() dto: UpdateHairCommissionRuleDto) {
    return this.finance.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission('hairCommissions', 'delete')
  removeRule(@Param('id') id: string) {
    return this.finance.removeRule(id);
  }

  @Post('payout')
  @RequirePermission('hairCommissions', 'create')
  @ApiOperation({ summary: 'Mark the selected unpaid commissions as paid' })
  payout(@Body() dto: PayoutCommissionsDto) {
    return this.finance.payout(dto);
  }
}

@ApiTags('hair-audit')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/audit-logs')
export class HairAuditLogsController {
  constructor(private readonly finance: HairFinanceService) {}

  @Get()
  @RequirePermission('hairAudit', 'view')
  @ApiOperation({ summary: 'Audit trail, newest first; type (= entity), from/to on createdAt' })
  list(@Query() query: HairListQueryDto) {
    return this.finance.listAuditLogs(query);
  }
}

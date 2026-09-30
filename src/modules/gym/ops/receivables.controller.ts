import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import {
  CancelReceivableDto,
  CreateInstallmentSaleDto,
  ListReceivablesQueryDto,
  ReceivablePaymentDto,
} from './receivables.dto';
import { GymReceivablesService } from './receivables.service';

@ApiTags('gym-receivables')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/receivables')
export class GymReceivablesController {
  constructor(private readonly receivables: GymReceivablesService) {}

  @Get()
  @RequirePermission('receivables', 'view')
  @ApiOperation({ summary: 'Taksitli satış planları' })
  list(@Query() query: ListReceivablesQueryDto) {
    return this.receivables.list(query);
  }

  @Get('debtors')
  @RequirePermission('receivables', 'view')
  @ApiOperation({ summary: 'Üye bazında kalan borç, gecikme ve sıradaki vade' })
  debtors() {
    return this.receivables.debtors();
  }

  @Get('overdue')
  @RequirePermission('receivables', 'view')
  @ApiOperation({ summary: 'Vadesi geçmiş taksitler' })
  overdue() {
    return this.receivables.overdue();
  }

  @Get(':id')
  @RequirePermission('receivables', 'view')
  get(@Param('id') id: string) {
    return this.receivables.get(id);
  }

  @Post()
  @RequirePermission('receivables', 'create')
  @ApiOperation({ summary: 'Paketi peşinat + taksitle sat, üyeliği başlat' })
  create(@Body() dto: CreateInstallmentSaleDto) {
    return this.receivables.createSale(dto);
  }

  @Post(':id/payments')
  @HttpCode(200)
  @RequirePermission('receivables', 'create')
  @ApiOperation({ summary: 'Tahsilat al (en eski açık taksitten başlayarak kapatır)' })
  pay(@Param('id') id: string, @Body() dto: ReceivablePaymentDto) {
    return this.receivables.recordPayment(id, dto);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('owner', 'admin')
  @RequirePermission('receivables', 'update')
  cancel(@Param('id') id: string, @Body() dto: CancelReceivableDto) {
    return this.receivables.cancel(id, dto);
  }
}

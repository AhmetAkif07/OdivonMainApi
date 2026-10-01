import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { Roles } from '../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { SaasBillingService } from './saas-billing.service';

/** Odivon subscription of the gym: billing state, receipts and owner notices (read-only). */
@ApiTags('gym-saas-billing')
@ApiBearerAuth()
@RequireModule('gym')
@Roles('owner', 'admin')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('gym/saas-billing')
export class SaasBillingController {
  constructor(private readonly billing: SaasBillingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Abonelik bitişi, ek süre ve kalan gün' })
  status() {
    return this.billing.status();
  }

  @Get('payments')
  @ApiOperation({ summary: 'Abonelik ödeme geçmişi ve makbuz numaraları' })
  payments() {
    return this.billing.history();
  }

  @Get('notices')
  @ApiOperation({ summary: 'Abonelik bitiş hatırlatmaları (uygulama içi)' })
  notices() {
    return this.billing.notices();
  }

  @Post('notices/read')
  @HttpCode(200)
  readNotices() {
    return this.billing.markNoticesRead();
  }
}

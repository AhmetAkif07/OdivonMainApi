import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { Roles } from '../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { SaasBillingService } from './saas-billing.service';

export class SubscribeDto {
  planId!: string;
  billingCycle!: 'monthly' | 'yearly';
  cardHolderName?: string;
}

/** Odivon subscription of the tenant (Gym, Vet, Farm): billing state, receipts, plans and subscribe. */
@ApiTags('saas-billing')
@ApiBearerAuth()
@Roles('owner', 'admin')
@UseGuards(FirebaseAuthGuard, TenantGuard, RoleGuard)
@Controller(['saas-billing', 'gym/saas-billing', 'vet/saas-billing'])
export class SaasBillingController {
  constructor(private readonly billing: SaasBillingService) {}

  @Get('status')
  @ApiOperation({ summary: 'Abonelik bitişi, ek süre, deneme ve kalan gün' })
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

  @Post('subscribe')
  @Roles('owner')
  @ApiOperation({ summary: 'Paket seçimi ve abonelik başlatma/ödeme tamamlama' })
  subscribe(@Body() dto: SubscribeDto) {
    return this.billing.subscribe(dto.planId, dto.billingCycle, dto.cardHolderName);
  }

  @Post('test/expire-trial')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Test: Deneme süresini anında sona erdirir' })
  expireTrial() {
    return this.billing.expireDemoTrial();
  }

  @Post('test/reset-trial')
  @Roles('owner', 'admin')
  @ApiOperation({ summary: 'Test: 14 günlük deneme süresini sıfırlar/yeniler' })
  resetTrial() {
    return this.billing.resetDemoTrial();
  }
}

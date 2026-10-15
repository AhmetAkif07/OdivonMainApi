import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { EmailVerifiedGuard } from '../../shared/auth/email-verified.guard';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { CreateCheckoutDto, SaveGymPaymentCredentialsDto, TestGymPaymentCredentialsDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('rentacar-payments')
@ApiBearerAuth()
@RequireModule('rentacar')
@UseGuards(FirebaseAuthGuard, TenantGuard, EmailVerifiedGuard, ModuleGuard, PermissionGuard)
@Controller('rentacar/payments')
export class RentacarPaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly credentials: GymPaymentCredentialsService) {}

  @Get('settings') @RequirePermission('rentSettings', 'view') settings() { return this.credentials.view(); }
  @Put('settings') @RequirePermission('rentSettings', 'update') save(@Body() dto: SaveGymPaymentCredentialsDto) { return this.credentials.save(dto); }
  @Post('settings/test') @HttpCode(200) @RequirePermission('rentSettings', 'update') test(@Body() dto: TestGymPaymentCredentialsDto) { return this.credentials.test(dto); }
  @Delete('settings') @RequirePermission('rentSettings', 'delete') remove() { return this.credentials.remove(); }

  @Post('checkout')
  @RequirePermission('rentFinance', 'create')
  @ApiOperation({ summary: 'Create an iyzico 3D Secure checkout for a reservation' })
  checkout(@Body() dto: CreateCheckoutDto, @Req() request: Request) {
    return this.payments.createCheckout({ ...dto, source: 'rentacar_reservation' }, request.header('cf-connecting-ip') ?? request.ip ?? '127.0.0.1', request.header('origin'));
  }

  @Get('sessions/:id') @RequirePermission('rentFinance', 'view') session(@Param('id') id: string) { return this.payments.get(id); }
  @Post('sessions/:id/reconcile') @RequirePermission('rentFinance', 'approve') reconcile(@Param('id') id: string) { return this.payments.reconcile(id); }
}

import { Body, Controller, Get, Logger, Param, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { Roles } from '../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { CreateCheckoutDto, CreateSaasOrderDto, SelectProviderDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@ApiBearerAuth()
@Roles('owner', 'admin')
@UseGuards(FirebaseAuthGuard, TenantGuard, RoleGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('providers')
  @ApiOperation({ summary: 'Available payment providers and the selected tenant provider' })
  providers() { return this.payments.getProviders(); }

  @Put('provider')
  @ApiOperation({ summary: 'Select tenant payment provider for sandbox checkout' })
  select(@Body() dto: SelectProviderDto) { return this.payments.select(dto.provider); }

  @Post('checkout')
  @ApiOperation({ summary: 'Create a sandbox checkout from a vet sale or gym receivable' })
  checkout(@Body() dto: CreateCheckoutDto, @Req() request: Request) {
    return this.payments.createCheckout(dto, request.header('cf-connecting-ip') ?? request.ip ?? '127.0.0.1', request.header('origin'));
  }

  @Get('saas-plans')
  @ApiOperation({ summary: 'Server-authoritative SaaS sandbox prices' })
  saasPlans() { return this.payments.saasPlans(); }

  @Get('saas-plans/catalog')
  @ApiOperation({ summary: 'Plans this tenant can buy, with names and current prices' })
  saasPlanCatalog() { return this.payments.saasPlanCatalog(); }

  @Post('saas-orders')
  @Roles('owner')
  @ApiOperation({ summary: 'Create a SaaS sandbox order for the current tenant' })
  saasOrder(@Body() dto: CreateSaasOrderDto) { return this.payments.createSaasOrder(dto); }

  @Get('sessions/:id')
  session(@Param('id') id: string) { return this.payments.get(id); }

  @Post('sessions/:id/reconcile')
  @ApiOperation({ summary: 'Recheck a pending sandbox payment with the selected provider' })
  reconcile(@Param('id') id: string) { return this.payments.reconcile(id); }
}

@ApiTags('payments')
@Controller('payments/callback')
export class PaymentCallbackController {
  private readonly logger = new Logger(PaymentCallbackController.name);

  constructor(private readonly payments: PaymentsService) {}

  /**
   * iyzico posts the browser here (form-encoded `token`). The result is retrieved server-side;
   * the browser is then sent back to the panel result page, also when verification fails.
   */
  @Post('iyzico/:id')
  @ApiOperation({ summary: 'iyzico checkout callback; payment is confirmed by server-side retrieve' })
  async callback(@Param('id') id: string, @Body('token') token: string, @Res() response: Response) {
    let outcome: 'succeeded' | 'failed' | 'pending' | 'error';
    try {
      outcome = (await this.payments.handleCallback(id, String(token ?? ''))).status as 'succeeded' | 'failed' | 'pending';
    } catch (error) {
      this.logger.warn(`Payment callback ${id} failed: ${(error as Error).message}`);
      outcome = 'error';
    }
    const returnUrl = await this.payments.returnUrl(id, outcome).catch(() => null);
    if (returnUrl) return response.redirect(303, returnUrl);
    return response.status(outcome === 'error' ? 400 : 200).json({ status: outcome });
  }
}

@ApiTags('payment-webhooks')
@Controller('webhooks/payments')
export class PaymentWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('iyzico/:id')
  @ApiOperation({ summary: 'Idempotent iyzico webhook/callback verification' })
  webhook(@Param('id') id: string, @Body('token') token: string) {
    return this.payments.handleCallback(id, String(token ?? ''));
  }
}

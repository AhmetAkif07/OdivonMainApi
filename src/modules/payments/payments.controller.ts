import { Body, Controller, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { Roles } from '../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { CreateCheckoutDto, SelectProviderDto } from './payments.dto';
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
    return this.payments.createCheckout(dto, request.header('cf-connecting-ip') ?? request.ip ?? '127.0.0.1');
  }

  @Get('sessions/:id')
  session(@Param('id') id: string) { return this.payments.get(id); }

  @Post('sessions/:id/reconcile')
  @ApiOperation({ summary: 'Recheck a pending sandbox payment with the selected provider' })
  reconcile(@Param('id') id: string) { return this.payments.reconcile(id); }
}

@ApiTags('payments')
@Controller('payments/callback')
export class PaymentCallbackController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('iyzico/:id')
  @ApiOperation({ summary: 'iyzico checkout callback; payment is confirmed by server-side retrieve' })
  callback(@Param('id') id: string, @Body('token') token: string) {
    return this.payments.handleCallback(id, token);
  }
}

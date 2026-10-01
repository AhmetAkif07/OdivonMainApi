import { Body, Controller, Delete, Get, HttpCode, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../shared/authorization/module.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { Roles } from '../../shared/authorization/roles.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { GymPaymentCredentialsService } from './gym-payment-credentials.service';
import { SaveGymPaymentCredentialsDto, TestGymPaymentCredentialsDto } from './payments.dto';

/**
 * The gym's own iyzico keys for member card payments. Owner/admin only; under `gym/` so every
 * change is written to the gym audit log (key fields are masked there).
 */
@ApiTags('gym-payment-settings')
@ApiBearerAuth()
@RequireModule('gym')
@Roles('owner', 'admin')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('gym/payment-settings')
export class GymPaymentSettingsController {
  constructor(private readonly credentials: GymPaymentCredentialsService) {}

  @Get()
  @ApiOperation({ summary: 'iyzico ayarı (anahtarlar yalnızca maskeli)' })
  get() {
    return this.credentials.view();
  }

  @Put()
  @ApiOperation({ summary: 'iyzico API/secret key, sandbox/canlı, açık/kapalı' })
  save(@Body() dto: SaveGymPaymentCredentialsDto) {
    return this.credentials.save(dto);
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Anahtarları ödeme yapmadan iyzico ile doğrula' })
  test(@Body() dto: TestGymPaymentCredentialsDto) {
    return this.credentials.test(dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Anahtarları sil (kartla ödeme kapanır)' })
  remove() {
    return this.credentials.remove();
  }
}

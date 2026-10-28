import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformTenantsService } from './tenants.service';
import {
  ExtendTenantDurationDto,
  ListTenantsQueryDto,
  SetTenantExpiryDto,
  SuspendTenantDto,
  UpdateTenantDto,
} from './dto';

@ApiTags('platform-tenants')
@RequirePlatformAdmin()
@Controller('platform/tenants')
export class PlatformTenantsController {
  constructor(private readonly tenantsService: PlatformTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Platform tenant listesi (arama, modül, durum ve üyelik filtreli)' })
  list(@Query() query: ListTenantsQueryDto) {
    return this.tenantsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tenant detayları (sahip, kullanıcı sayısı, abonelik, ödemeler)' })
  getById(@Param('id') id: string) {
    return this.tenantsService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Tenant güncelle (isim, modüller)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.update(id, dto, admin);
  }

  @Post(':id/extend')
  @ApiOperation({ summary: 'Hesap süresini uzat (trial veya subscription, gün bazlı)' })
  extend(
    @Param('id') id: string,
    @Body() dto: ExtendTenantDurationDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.extendDuration(id, dto, admin);
  }

  @Post(':id/set-expiry')
  @ApiOperation({ summary: 'Hesap bitiş tarihini doğrudan ata' })
  setExpiry(
    @Param('id') id: string,
    @Body() dto: SetTenantExpiryDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.setExpiry(id, dto, admin);
  }

  @Post(':id/expire')
  @ApiOperation({ summary: 'Hesap süresini hemen sonlandır (süresi doldu)' })
  expireImmediately(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.expireImmediately(id, admin);
  }

  @Post(':id/suspend')
  @ApiOperation({ summary: 'Tenant ve tüm kullanıcılarını pasife al' })
  suspend(
    @Param('id') id: string,
    @Body() dto: SuspendTenantDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.suspend(id, dto, admin);
  }

  @Post(':id/reactivate')
  @ApiOperation({ summary: 'Tenant ve platform tarafından pasife alınan kullanıcıları yeniden aktifleştir' })
  reactivate(
    @Param('id') id: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.reactivate(id, admin);
  }

  @Get(':id/users')
  @ApiOperation({ summary: 'Tenant altındaki kullanıcıları listele' })
  listUsers(@Param('id') id: string) {
    return this.tenantsService.listTenantUsers(id);
  }

  @Post(':id/users/:uid/verify-email')
  @ApiOperation({ summary: 'Kullanıcının e-postasını elle doğrulanmış işaretle (Auth + profil)' })
  verifyUserEmail(
    @Param('id') id: string,
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.markUserEmailVerified(id, uid, admin);
  }

  @Post(':id/users/:uid/resend-verification')
  @ApiOperation({ summary: 'Kullanıcıya yeni e-posta doğrulama bağlantısı gönder' })
  resendUserVerification(
    @Param('id') id: string,
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.tenantsService.resendUserVerification(id, uid, admin);
  }
}

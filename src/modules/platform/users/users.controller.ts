import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformUsersService } from './users.service';
import { PlatformTenantsService } from '../tenants/tenants.service';
import { DeletePlatformUserDto, ListUsersQueryDto, UpdatePlatformUserDto } from './dto';

@ApiTags('platform-users')
@RequirePlatformAdmin()
@Controller('platform/users')
export class PlatformUsersController {
  constructor(
    private readonly usersService: PlatformUsersService,
    private readonly tenantsService: PlatformTenantsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Platform genelinde kullanıcı ara / listele' })
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
  }

  @Post('stale-profiles/cleanup')
  @ApiOperation({ summary: 'Firebase Auth hesabı silinmiş tüm kullanıcı profillerini Firestore\'dan temizle' })
  cleanupStaleProfiles(
    @Body() dto: DeletePlatformUserDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.usersService.cleanupStaleProfiles(dto, admin);
  }

  @Get(':uid')
  @ApiOperation({ summary: 'Kullanıcı detayını getir' })
  getByUid(@Param('uid') uid: string) {
    return this.usersService.getByUid(uid);
  }

  @Patch(':uid')
  @ApiOperation({ summary: 'Kullanıcı durumunu / adını güncelle (aktif/pasif)' })
  update(
    @Param('uid') uid: string,
    @Body() dto: UpdatePlatformUserDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.usersService.updateUser(uid, dto, admin);
  }

  @Delete(':uid')
  @ApiOperation({ summary: 'Kullanıcıyı kalıcı olarak sil (Firebase Auth + profil)' })
  remove(
    @Param('uid') uid: string,
    @Body() dto: DeletePlatformUserDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.usersService.deleteUser(uid, dto, admin);
  }

  @Post(':uid/password-reset-link')
  @ApiOperation({ summary: 'Kullanıcı için Firebase şifre sıfırlama linki oluştur' })
  generateResetLink(
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.usersService.generatePasswordResetLink(uid, admin);
  }

  @Post(':uid/verify-email')
  @ApiOperation({ summary: 'Kullanıcının e-postasını elle doğrulanmış işaretle (Auth + profil)' })
  async verifyEmail(
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    const tenantId = await this.tenantsService.resolveUserTenantId(uid);
    return this.tenantsService.markUserEmailVerified(tenantId, uid, admin);
  }

  @Post(':uid/resend-verification')
  @ApiOperation({ summary: 'Kullanıcıya yeni e-posta doğrulama bağlantısı gönder' })
  async resendVerification(
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    const tenantId = await this.tenantsService.resolveUserTenantId(uid);
    return this.tenantsService.resendUserVerification(tenantId, uid, admin);
  }

  @Post(':uid/revoke-sessions')
  @ApiOperation({ summary: 'Kullanıcının tüm aktif oturumlarını sonlandır' })
  revokeSessions(
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.usersService.revokeSessions(uid, admin);
  }
}

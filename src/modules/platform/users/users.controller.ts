import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformUsersService } from './users.service';
import { ListUsersQueryDto, UpdatePlatformUserDto } from './dto';

@ApiTags('platform-users')
@RequirePlatformAdmin()
@Controller('platform/users')
export class PlatformUsersController {
  constructor(private readonly usersService: PlatformUsersService) {}

  @Get()
  @ApiOperation({ summary: 'Platform genelinde kullanıcı ara / listele' })
  list(@Query() query: ListUsersQueryDto) {
    return this.usersService.list(query);
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

  @Post(':uid/password-reset-link')
  @ApiOperation({ summary: 'Kullanıcı için Firebase şifre sıfırlama linki oluştur' })
  generateResetLink(
    @Param('uid') uid: string,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.usersService.generatePasswordResetLink(uid, admin);
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

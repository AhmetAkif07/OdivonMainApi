import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformOrphanTenantsService } from './orphan-tenants.service';
import { DeleteOrphanTenantsDto } from './dto';

@ApiTags('platform-orphan-tenants')
@RequirePlatformAdmin()
@Controller('platform/orphan-tenants')
export class PlatformOrphanTenantsController {
  constructor(private readonly orphans: PlatformOrphanTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'users koleksiyonunda hiç kullanıcısı olmayan tenantları listele' })
  list() {
    return this.orphans.list();
  }

  @Post('delete')
  @ApiOperation({ summary: 'Kullanıcısız tenantları toplu sil (soft: gizle, hard: tüm verisiyle kalıcı sil)' })
  delete(@Body() dto: DeleteOrphanTenantsDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.orphans.delete(dto, admin);
  }
}

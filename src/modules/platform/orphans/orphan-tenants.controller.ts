import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformOrphanTenantsService } from './orphan-tenants.service';
import { DeleteOrphanTenantsDto, PurgeOrphanTenantStepDto } from './dto';

@ApiTags('platform-orphan-tenants')
@RequirePlatformAdmin()
@Controller('platform/orphan-tenants')
export class PlatformOrphanTenantsController {
  constructor(private readonly orphans: PlatformOrphanTenantsService) {}

  @Get()
  @ApiOperation({ summary: 'Firebase Auth üzerinde hiç kullanıcısı olmayan tenantları listele' })
  list() {
    return this.orphans.list();
  }

  @Post('purge-step')
  @ApiOperation({
    summary: 'Kullanıcısız bir tenantı parça parça kalıcı sil; done=true dönene kadar tekrar çağrılır',
  })
  purgeStep(@Body() dto: PurgeOrphanTenantStepDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.orphans.purgeStep(dto, admin);
  }

  @Post('delete')
  @ApiOperation({ summary: 'Kullanıcısız tenantları toplu gizle (soft). Kalıcı silme purge-step ile yapılır' })
  delete(@Body() dto: DeleteOrphanTenantsDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.orphans.delete(dto, admin);
  }
}

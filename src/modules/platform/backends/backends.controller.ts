import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformBackendsService } from './backends.service';
import { RemoteTenantStatusDto, UpsertBackendDto } from './dto';

@ApiTags('platform-backends')
@RequirePlatformAdmin()
@Controller('platform/backends')
export class PlatformBackendsController {
  constructor(private readonly backends: PlatformBackendsService) {}

  @Get()
  @ApiOperation({ summary: 'Ürünlerin API/Firebase kaydı ve canlı sağlık kontrolü' })
  overview() {
    return this.backends.overview();
  }

  @Get(':id/tenants')
  @ApiOperation({ summary: 'Harici API\'deki kiracılar (ör. ERP)' })
  tenants(@Param('id') id: string) {
    return this.backends.remoteTenants(id);
  }

  @Post(':id/tenants/:tenantId/status')
  @ApiOperation({ summary: 'Harici API\'deki kiracıyı askıya al / aç / kapat' })
  setTenantStatus(
    @Param('id') id: string,
    @Param('tenantId') tenantId: string,
    @Body() dto: RemoteTenantStatusDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.backends.setRemoteTenantStatus(id, tenantId, dto, admin);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Altyapı kaydını ekle veya güncelle' })
  upsert(@Param('id') id: string, @Body() dto: UpsertBackendDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.backends.upsert(id, dto, admin);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eklenen kaydı sil / varsayılan kaydı sıfırla' })
  remove(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.backends.remove(id, admin);
  }
}

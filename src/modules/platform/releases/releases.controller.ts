import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformReleasesService } from './releases.service';
import { CreateReleaseDto, ListReleasesQueryDto, UpdateReleaseDto } from './dto';

@ApiTags('platform-releases')
@RequirePlatformAdmin()
@Controller('platform/releases')
export class PlatformReleasesController {
  constructor(private readonly releases: PlatformReleasesService) {}

  @Get()
  @ApiOperation({ summary: 'Sürüm geçmişi (modül filtreli) ve modül başına son sürüm' })
  list(@Query() query: ListReleasesQueryDto) {
    return this.releases.list(query);
  }

  @Get('overview')
  @ApiOperation({ summary: 'Modül başına son sürüm ve tenantların hangi sürümü kullandığı' })
  overview() {
    return this.releases.overview();
  }

  @Get('tenants/:tenantId')
  @ApiOperation({ summary: 'Bir tenantın modül bazında çalışan sürümü ve sürüm değişim geçmişi' })
  tenantVersions(@Param('tenantId') tenantId: string) {
    return this.releases.tenantVersions(tenantId);
  }

  @Post()
  @ApiOperation({ summary: 'Yeni sürüm kaydı ekle' })
  create(@Body() dto: CreateReleaseDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.releases.create(dto, admin);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sürüm kaydını güncelle' })
  update(@Param('id') id: string, @Body() dto: UpdateReleaseDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.releases.update(id, dto, admin);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Sürüm kaydını sil' })
  remove(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.releases.remove(id, admin);
  }
}

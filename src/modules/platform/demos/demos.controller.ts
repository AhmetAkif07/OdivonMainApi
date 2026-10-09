import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin, CurrentPlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformDemosService } from './demos.service';
import { ConvertDemoDto, CreateDemoTenantDto, ResetDemoDto } from './dto';

@ApiTags('platform-demos')
@RequirePlatformAdmin()
@Controller('platform/demos')
export class PlatformDemosController {
  constructor(private readonly demosService: PlatformDemosService) {}

  @Get()
  @ApiOperation({ summary: 'Demo tenantları listele (durum ve pasife kalan gün hesaplanmış)' })
  list() {
    return this.demosService.listDemos();
  }

  @Post()
  @ApiOperation({ summary: 'Yeni demo tenant oluştur (otomatik kullanıcı, tenant ve örnek veri)' })
  create(
    @Body() dto: CreateDemoTenantDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.demosService.createDemo(dto, admin);
  }

  @Post(':id/reset')
  @ApiOperation({ summary: 'Demo süresini yenile ve istenirse yeniden örnek veri yükle' })
  reset(
    @Param('id') id: string,
    @Body() dto: ResetDemoDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.demosService.resetDemo(id, dto, admin);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Demo hesabı ücretli standart hesaba dönüştür' })
  convert(
    @Param('id') id: string,
    @Body() dto: ConvertDemoDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.demosService.convertDemo(id, dto, admin);
  }
}

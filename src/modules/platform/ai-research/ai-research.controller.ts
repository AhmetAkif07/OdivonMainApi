import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPlatformAdmin, RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformAiResearchService } from './ai-research.service';
import { CreateAiResearchRunDto, UpdateAiLeadDto } from './dto';

@ApiTags('platform-ai-research')
@RequirePlatformAdmin()
@Controller('platform/ai-research')
export class PlatformAiResearchController {
  constructor(private readonly service: PlatformAiResearchService) {}

  @Get('config')
  @ApiOperation({ summary: 'Araştırılabilir şehirler, ilçeler ve varsayılan anahtar kelimeler' })
  config() {
    return this.service.getConfig();
  }

  @Get('runner')
  @ApiOperation({ summary: 'OdivonAI runner çevrimiçi mi, ne yapıyor' })
  runner() {
    return this.service.getRunnerStatus();
  }

  @Get('runs')
  @ApiOperation({ summary: 'Son 50 araştırma' })
  listRuns() {
    return this.service.listRuns();
  }

  @Post('runs')
  @ApiOperation({ summary: 'Yeni araştırmayı kuyruğa ekle (runner alıp çalıştırır)' })
  createRun(@Body() dto: CreateAiResearchRunDto, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.createRun(dto, admin);
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Araştırma durumu ve ilerlemesi' })
  getRun(@Param('id') id: string) {
    return this.service.getRun(id);
  }

  @Post('runs/:id/cancel')
  @ApiOperation({ summary: 'Araştırmayı iptal et' })
  cancelRun(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.cancelRun(id, admin);
  }

  @Post('runs/:id/retry')
  @ApiOperation({ summary: 'Hatalı/iptal edilmiş araştırmayı kaldığı yerden tekrar kuyruğa al' })
  retryRun(@Param('id') id: string, @CurrentPlatformAdmin() admin: PlatformAdminUser) {
    return this.service.retryRun(id, admin);
  }

  @Get('leads')
  @ApiOperation({ summary: 'Potansiyel müşteriler (öncelik sırasıyla, filtreli)' })
  listLeads(
    @Query('runId') runId?: string,
    @Query('priority') priority?: string,
    @Query('status') status?: string,
    @Query('district') district?: string,
    @Query('segment') segment?: string,
    @Query('competitor') competitor?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listLeads({ runId, priority, status, district, segment, competitor, q });
  }

  @Get('leads/:id')
  @ApiOperation({ summary: 'Potansiyel müşteri detayı: site/uygulama analizi, yorumlar, strateji ve mesajlar' })
  getLead(@Param('id') id: string) {
    return this.service.getLead(id);
  }

  @Patch('leads/:id')
  @ApiOperation({ summary: 'Satış durumu ve notu güncelle' })
  updateLead(
    @Param('id') id: string,
    @Body() dto: UpdateAiLeadDto,
    @CurrentPlatformAdmin() admin: PlatformAdminUser,
  ) {
    return this.service.updateLead(id, dto, admin);
  }
}

import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin } from '../platform-admin.decorator';
import { parseRange } from './traffic.config';
import { PlatformTrafficService } from './traffic.service';

@ApiTags('platform-traffic')
@RequirePlatformAdmin()
@Controller('platform/traffic')
export class PlatformTrafficController {
  constructor(private readonly traffic: PlatformTrafficService) {}

  @Get('status')
  @ApiOperation({ summary: 'Trafik analizi yapılandırma durumu' })
  status() {
    return this.traffic.status();
  }

  @Get('overview')
  @ApiOperation({ summary: 'Seçilen aralıkta istek, hata, gecikme ve dağılımlar (Analytics Engine)' })
  overview(@Query('range') range?: string) {
    return this.traffic.overview(parseRange(range));
  }

  @Get('live')
  @ApiOperation({ summary: 'Son 5 dakika: 10 sn kovalar ve son istekler' })
  live() {
    return this.traffic.live();
  }

  @Get('cloudflare')
  @ApiOperation({ summary: 'Cloudflare Worker metrikleri (istek, hata, alt istek, CPU)' })
  cloudflare(@Query('range') range?: string) {
    return this.traffic.cloudflare(parseRange(range));
  }
}

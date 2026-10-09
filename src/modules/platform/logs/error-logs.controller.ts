import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformErrorLogsService, QueryErrorLogsDto } from './error-logs.service';

@ApiTags('platform-error-logs')
@RequirePlatformAdmin()
@Controller('platform/error-logs')
export class PlatformErrorLogsController {
  constructor(private readonly errorLogsService: PlatformErrorLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Platform API hata loglarını listele' })
  list(@Query() query: QueryErrorLogsDto) {
    return this.errorLogsService.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Son 24 saatteki hata loglarının özet istatistikleri' })
  getSummary(@Query('hours') hours?: string) {
    return this.errorLogsService.getSummary(hours ? Number(hours) : 24);
  }
}

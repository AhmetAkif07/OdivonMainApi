import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePlatformAdmin } from '../platform-admin.decorator';
import { PlatformAuditService, ListAuditQueryDto } from './platform-audit.service';

@ApiTags('platform-audit')
@RequirePlatformAdmin()
@Controller('platform/audit-logs')
export class PlatformAuditController {
  constructor(private readonly auditService: PlatformAuditService) {}

  @Get()
  @ApiOperation({ summary: 'Platform admin işlem kayıtlarını listele' })
  list(@Query() query: ListAuditQueryDto) {
    return this.auditService.list(query);
  }
}

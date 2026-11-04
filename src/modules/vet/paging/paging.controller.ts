import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { InboxQueryDto, SendPageDto } from './paging.dto';
import { PagingService } from './paging.service';

/** In-clinic paging. Open to every clinic user (no permission resource). */
@ApiTags('vet-paging')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/pages')
export class PagingController {
  constructor(private readonly service: PagingService) {}

  @Get('recipients')
  @ApiOperation({ summary: 'People and roles that can be paged' })
  recipients() {
    return this.service.recipients();
  }

  @Post()
  @ApiOperation({ summary: 'Send a page to a person, a role or everyone' })
  send(@Body() dto: SendPageDto) {
    return this.service.send(dto);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'Pages for me in the last 24 hours, with unread counts (poll ~15 s)' })
  inbox(@Query() query: InboxQueryDto) {
    return this.service.inbox(query);
  }

  @Get('sent')
  @ApiOperation({ summary: 'Pages I sent in the last 7 days, with who has acknowledged' })
  sent() {
    return this.service.sent();
  }

  @Post('ack-all')
  acknowledgeAll() {
    return this.service.acknowledgeAll();
  }

  @Post(':id/ack')
  acknowledge(@Param('id') id: string) {
    return this.service.acknowledge(id);
  }
}

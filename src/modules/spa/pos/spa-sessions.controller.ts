import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { SpaGuards } from '../shared/spa-guards';
import { SpaListQueryDto } from '../shared/spa-list.dto';
import { SpaStore } from '../shared/spa-store';
import { CheckoutSessionDto } from './pos.dto';
import { SpaPosService } from './spa-pos.service';

/** Sessions are written only by checkout — there is no create/update/delete endpoint. */
@ApiTags('spa-sessions')
@ApiBearerAuth()
@RequireModule('spa')
@UseGuards(...SpaGuards)
@Controller('spa/sessions')
export class SpaSessionsController {
  constructor(
    private readonly store: SpaStore,
    private readonly pos: SpaPosService,
  ) {}

  @Get()
  @RequirePermission('spaSessions', 'view')
  @ApiOperation({ summary: 'Sessions by createdAt window and/or customer, newest first' })
  list(@Query() query: SpaListQueryDto) {
    return this.store.list(TENANT_COLLECTION.spaSessions, {
      dateField: 'createdAt',
      from: query.from,
      to: query.to,
      equals: { customerId: query.customerId, staffId: query.staffId },
      orderBy: { field: 'createdAt', dir: 'desc' },
      limit: query.limit,
    });
  }

  @Get(':id')
  @RequirePermission('spaSessions', 'view')
  get(@Param('id') id: string) {
    return this.store.getOrThrow(TENANT_COLLECTION.spaSessions, id, 'Seans bulunamadı.');
  }

  @Post('checkout')
  @RequirePermission('spaSessions', 'create')
  checkout(@Body() dto: CheckoutSessionDto) {
    return this.pos.checkout(dto);
  }
}

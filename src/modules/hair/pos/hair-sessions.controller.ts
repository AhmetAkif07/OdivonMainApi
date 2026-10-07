import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairPosService } from './hair-pos.service';
import { CheckoutDto, RefundSessionDto } from './pos.dto';

@ApiTags('hair-pos')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/pos')
export class HairPosController {
  constructor(private readonly pos: HairPosService) {}

  @Post('checkout')
  @RequirePermission('hairSessions', 'create')
  @ApiOperation({ summary: 'Checkout: payment + stock + packages + commission in one transaction' })
  checkout(@Body() dto: CheckoutDto) {
    return this.pos.checkout(dto);
  }
}

/** Sessions are written only by checkout / refund — there is no create, update or delete endpoint. */
@ApiTags('hair-pos')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/sessions')
export class HairSessionsController {
  constructor(private readonly pos: HairPosService) {}

  @Get()
  @RequirePermission('hairSessions', 'view')
  @ApiOperation({ summary: 'Sessions with from <= date <= to (YYYY-MM-DD); branchId, customerId, staffId, status' })
  list(@Query() query: HairListQueryDto) {
    return this.pos.listSessions(query);
  }

  @Get(':id')
  @RequirePermission('hairSessions', 'view')
  get(@Param('id') id: string) {
    return this.pos.getSession(id);
  }

  @Post(':id/refund')
  @RequirePermission('hairSessions', 'update')
  @ApiOperation({ summary: 'Full or partial refund (reverses stock, packages, commissions)' })
  refund(@Param('id') id: string, @Body() dto: RefundSessionDto) {
    return this.pos.refund(id, dto);
  }
}

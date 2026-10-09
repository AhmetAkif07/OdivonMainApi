import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairWaitlistService } from './hair-waitlist.service';
import { CreateHairWaitlistDto, UpdateHairWaitlistDto } from './waitlist.dto';

@ApiTags('hair-waitlist')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/waitlist')
export class HairWaitlistController {
  constructor(private readonly waitlist: HairWaitlistService) {}

  @Get()
  @RequirePermission('hairAppointments', 'view')
  @ApiOperation({ summary: 'Waitlist, oldest first; branchId, status, customerId, date (= preferredDate)' })
  list(@Query() query: HairListQueryDto) {
    return this.waitlist.list(query);
  }

  @Post()
  @RequirePermission('hairAppointments', 'create')
  create(@Body() dto: CreateHairWaitlistDto) {
    return this.waitlist.create(dto);
  }

  @Patch(':id')
  @RequirePermission('hairAppointments', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairWaitlistDto) {
    return this.waitlist.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairAppointments', 'delete')
  remove(@Param('id') id: string) {
    return this.waitlist.remove(id);
  }
}

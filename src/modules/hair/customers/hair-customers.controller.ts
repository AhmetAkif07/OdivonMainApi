import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { CreateHairCustomerDto, MergeHairCustomerDto, UpdateHairCustomerDto } from './customer.dto';
import { HairCustomersService } from './hair-customers.service';

@ApiTags('hair-customers')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/customers')
export class HairCustomersController {
  constructor(private readonly customers: HairCustomersService) {}

  @Get()
  @RequirePermission('hairCustomers', 'view')
  @ApiOperation({ summary: 'Customers; ?search= matches name, e-mail or phone digits' })
  list(@Query() query: HairListQueryDto) {
    return this.customers.list(query);
  }

  @Get(':id')
  @RequirePermission('hairCustomers', 'view')
  get(@Param('id') id: string) {
    return this.customers.get(id);
  }

  @Get(':id/history')
  @RequirePermission('hairCustomers', 'view')
  @ApiOperation({ summary: '{ appointments, payments, packages } of the customer' })
  history(@Param('id') id: string) {
    return this.customers.history(id);
  }

  @Get(':id/consents')
  @RequirePermission('hairCustomers', 'view')
  @ApiOperation({ summary: 'Consent changes { consent, granted, channel, at, by }, newest first' })
  consents(@Param('id') id: string) {
    return this.customers.consents(id);
  }

  @Post(':id/anonymize')
  @RequirePermission('hairCustomers', 'delete')
  @ApiOperation({
    summary: 'KVKK: erase personal data (admin only); keeps financial records, deletes formulas and media',
  })
  anonymize(@Param('id') id: string) {
    return this.customers.anonymize(id);
  }

  @Post()
  @RequirePermission('hairCustomers', 'create')
  @ApiOperation({ summary: 'Create a customer (phone unique per salon)' })
  create(@Body() dto: CreateHairCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  @RequirePermission('hairCustomers', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Post(':id/merge')
  @RequirePermission('hairCustomers', 'update')
  @ApiOperation({ summary: 'Merge a duplicate customer (body.sourceId) into this one' })
  merge(@Param('id') id: string, @Body() dto: MergeHairCustomerDto) {
    return this.customers.merge(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairCustomers', 'delete')
  remove(@Param('id') id: string) {
    return this.customers.remove(id);
  }
}

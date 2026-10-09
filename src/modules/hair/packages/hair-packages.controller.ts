import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import { HairPackagesService } from './hair-packages.service';
import {
  CreateHairPackageDto,
  SellCustomerPackageDto,
  UpdateCustomerPackageDto,
  UpdateHairPackageDto,
} from './package.dto';

@ApiTags('hair-packages')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/packages')
export class HairPackagesController {
  constructor(private readonly packages: HairPackagesService) {}

  @Get()
  @RequirePermission('hairPackages', 'view')
  list(@Query() query: HairListQueryDto) {
    return this.packages.listPackages(query);
  }

  @Get(':id')
  @RequirePermission('hairPackages', 'view')
  get(@Param('id') id: string) {
    return this.packages.getPackage(id);
  }

  @Post()
  @RequirePermission('hairPackages', 'create')
  create(@Body() dto: CreateHairPackageDto) {
    return this.packages.createPackage(dto);
  }

  @Patch(':id')
  @RequirePermission('hairPackages', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairPackageDto) {
    return this.packages.updatePackage(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairPackages', 'delete')
  remove(@Param('id') id: string) {
    return this.packages.removePackage(id);
  }
}

@ApiTags('hair-packages')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/customer-packages')
export class HairCustomerPackagesController {
  constructor(private readonly packages: HairPackagesService) {}

  @Get()
  @RequirePermission('hairPackages', 'view')
  @ApiOperation({ summary: 'Sold packages; customerId, status (active|expired|completed|cancelled)' })
  list(@Query() query: HairListQueryDto) {
    return this.packages.listCustomerPackages(query);
  }

  @Post()
  @RequirePermission('hairPackages', 'create')
  @ApiOperation({ summary: 'Sell a package to a customer (optionally with payment)' })
  sell(@Body() dto: SellCustomerPackageDto) {
    return this.packages.sell(dto);
  }

  @Patch(':id')
  @RequirePermission('hairPackages', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateCustomerPackageDto) {
    return this.packages.updateCustomerPackage(id, dto);
  }
}

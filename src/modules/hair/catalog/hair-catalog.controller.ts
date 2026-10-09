import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { HairGuards } from '../shared/hair-guards';
import { HairListQueryDto } from '../shared/hair-list.dto';
import {
  CreateHairProductDto,
  CreateHairServiceCategoryDto,
  CreateHairServiceDto,
  UpdateHairProductDto,
  UpdateHairServiceCategoryDto,
  UpdateHairServiceDto,
} from './catalog.dto';
import { HairCatalogService } from './hair-catalog.service';

@ApiTags('hair-catalog')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/service-categories')
export class HairServiceCategoriesController {
  constructor(private readonly catalog: HairCatalogService) {}

  @Get()
  @RequirePermission('hairCatalog', 'view')
  list(@Query() query: HairListQueryDto) {
    return this.catalog.listCategories(query);
  }

  @Post()
  @RequirePermission('hairCatalog', 'create')
  create(@Body() dto: CreateHairServiceCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Patch(':id')
  @RequirePermission('hairCatalog', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairServiceCategoryDto) {
    return this.catalog.updateCategory(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairCatalog', 'delete')
  remove(@Param('id') id: string) {
    return this.catalog.removeCategory(id);
  }
}

@ApiTags('hair-catalog')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/services')
export class HairServicesController {
  constructor(private readonly catalog: HairCatalogService) {}

  @Get()
  @RequirePermission('hairCatalog', 'view')
  @ApiOperation({ summary: 'Services; filters: categoryId, branchId, staffId, status=active|inactive, search' })
  list(@Query() query: HairListQueryDto) {
    return this.catalog.listServices(query);
  }

  @Get(':id')
  @RequirePermission('hairCatalog', 'view')
  get(@Param('id') id: string) {
    return this.catalog.getService(id);
  }

  @Post()
  @RequirePermission('hairCatalog', 'create')
  create(@Body() dto: CreateHairServiceDto) {
    return this.catalog.createService(dto);
  }

  @Patch(':id')
  @RequirePermission('hairCatalog', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairServiceDto) {
    return this.catalog.updateService(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairCatalog', 'delete')
  remove(@Param('id') id: string) {
    return this.catalog.removeService(id);
  }
}

@ApiTags('hair-catalog')
@ApiBearerAuth()
@RequireModule('hair')
@UseGuards(...HairGuards)
@Controller('hair/products')
export class HairProductsController {
  constructor(private readonly catalog: HairCatalogService) {}

  @Get()
  @RequirePermission('hairStock', 'view')
  @ApiOperation({ summary: 'Products; filters: branchId, categoryId (= category name), status=low, search' })
  list(@Query() query: HairListQueryDto) {
    return this.catalog.listProducts(query);
  }

  @Get(':id')
  @RequirePermission('hairStock', 'view')
  get(@Param('id') id: string) {
    return this.catalog.getProduct(id);
  }

  @Post()
  @RequirePermission('hairStock', 'create')
  create(@Body() dto: CreateHairProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch(':id')
  @RequirePermission('hairStock', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateHairProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Delete(':id')
  @RequirePermission('hairStock', 'delete')
  remove(@Param('id') id: string) {
    return this.catalog.removeProduct(id);
  }
}

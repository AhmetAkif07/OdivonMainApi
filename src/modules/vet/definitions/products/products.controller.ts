import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';
import { ProductsService } from './products.service';

@ApiTags('vet-products')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'List products and services' })
  list(@Query() query: ListProductsQueryDto) {
    return this.service.list(query);
  }

  @Post()

  @RequirePermission('products', 'create')
  @ApiOperation({ summary: 'Create a product or service' })
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')

  @RequirePermission('products', 'update')
  @ApiOperation({ summary: 'Update a product or service' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('products', 'delete')
  @ApiOperation({ summary: 'Soft-delete a product or service' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

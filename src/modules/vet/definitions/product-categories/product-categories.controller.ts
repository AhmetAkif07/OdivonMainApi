import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { ProductCategoriesService } from './product-categories.service';
import { CreateProductCategoryDto, UpdateProductCategoryDto } from './product-category.dto';

@ApiTags('vet-product-categories')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/product-categories')
export class ProductCategoriesController {
  constructor(private readonly service: ProductCategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List product categories' })
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a product category' })
  create(@Body() dto: CreateProductCategoryDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product category by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product category' })
  update(@Param('id') id: string, @Body() dto: UpdateProductCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a product category' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

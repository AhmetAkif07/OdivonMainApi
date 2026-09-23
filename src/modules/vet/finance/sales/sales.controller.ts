import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateSaleDto, ListSalesQueryDto, UpdateSaleDto } from './sale.dto';
import { SalesService } from './sales.service';

@ApiTags('vet-sales')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Get()

  @RequirePermission('sales', 'view')
  @ApiOperation({ summary: 'List sales and purchases' })
  list(@Query() query: ListSalesQueryDto) {
    return this.service.list(query);
  }

  @Post()

  @RequirePermission('sales', 'create')
  create(@Body() dto: CreateSaleDto) {
    return this.service.create(dto);
  }

  @Get(':id')

  @RequirePermission('sales', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')

  @RequirePermission('sales', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('sales', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

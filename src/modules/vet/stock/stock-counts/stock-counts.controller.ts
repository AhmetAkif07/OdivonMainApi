import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateStockCountDto, StockCountQueryDto, UpdateStockCountDto } from './stock-count.dto';
import { StockCountsService } from './stock-counts.service';

@ApiTags('vet-stock-counts')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/stock-counts')
export class StockCountsController {
  constructor(private readonly service: StockCountsService) {}

  @Get()
  @RequirePermission('stockCounts', 'view')
  list(@Query() query: StockCountQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Start a count sheet for a store' })
  @RequirePermission('stockCounts', 'create')
  create(@Body() dto: CreateStockCountDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('stockCounts', 'view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Enter counted quantities' })
  @RequirePermission('stockCounts', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateStockCountDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/apply')
  @ApiOperation({ summary: 'Book count differences as stock adjustments' })
  @RequirePermission('stockCounts', 'update')
  apply(@Param('id') id: string) {
    return this.service.apply(id);
  }

  @Delete(':id')
  @RequirePermission('stockCounts', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { id };
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateStockMovementDto, ListStockMovementsQueryDto, UpdateStockMovementDto } from './stock-movement.dto';
import { StockMovementsService } from './stock-movements.service';

@ApiTags('vet-stock-movements')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/stock-movements')
export class StockMovementsController {
  constructor(private readonly service: StockMovementsService) {}

  @Get()
  @RequirePermission('stockMovements', 'view')
  list(@Query() query: ListStockMovementsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermission('stockMovements', 'create')
  create(@Body() dto: CreateStockMovementDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('stockMovements', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @RequirePermission('stockMovements', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateStockMovementDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('stockMovements', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

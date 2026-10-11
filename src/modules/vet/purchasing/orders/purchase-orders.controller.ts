import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreatePurchaseOrderDto, ReceiveGoodsDto } from './purchase-order.dto';
import { PurchaseOrdersService } from './purchase-orders.service';

@ApiTags('vet-purchasing-orders')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/purchasing/orders')
export class PurchaseOrdersController {
  constructor(private readonly service: PurchaseOrdersService) {}

  @Get()
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'List all purchase orders' })
  list() {
    return this.service.list();
  }

  @Get(':id')
  @RequirePermission('demands', 'view')
  @ApiOperation({ summary: 'Get purchase order details' })
  getById(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Post()
  @RequirePermission('demands', 'create')
  @ApiOperation({ summary: 'Create new purchase order' })
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.service.create(dto);
  }

  @Post(':id/submit-approval')
  @RequirePermission('demands', 'update')
  @ApiOperation({ summary: 'Submit purchase order to approval workflow' })
  submitApproval(@Param('id') id: string) {
    return this.service.submitApproval(id);
  }

  @Post(':id/receive-goods')
  @RequirePermission('demands', 'update')
  @ApiOperation({ summary: 'Receive goods and automatically post to inventory stock ledger' })
  receiveGoods(@Param('id') id: string, @Body() dto: ReceiveGoodsDto) {
    return this.service.receiveGoods(id, dto);
  }

  @Delete(':id')
  @RequirePermission('demands', 'delete')
  @ApiOperation({ summary: 'Cancel purchase order' })
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}

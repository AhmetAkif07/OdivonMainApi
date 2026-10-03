import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import {
  CreatePurchaseOrderDto,
  CreateStockCountDto,
  LowStockQueryDto,
  PurchaseOrderQueryDto,
  ReceivePurchaseOrderDto,
  StockMovementQueryDto,
  UpdatePurchaseOrderDto,
  UpdateStockCountDto,
} from './stock.dto';
import { GymStockService } from './stock.service';

/** Stock count and low stock follow the shop permission; purchase orders the supplier permission. */
@ApiTags('gym-stock')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('gym/stock')
export class GymStockController {
  constructor(private readonly stock: GymStockService) {}

  @Get('low')
  @RequirePermission('shop', 'view')
  @ApiOperation({ summary: 'Minimum stokun altındaki ürünler ve önerilen sipariş miktarı' })
  low(@Query() query: LowStockQueryDto) {
    return this.stock.lowStock(query.supplierId);
  }

  @Get('movements')
  @RequirePermission('shop', 'view')
  @ApiOperation({ summary: 'Stok hareketleri (sayım farkı, mal kabul); son 200' })
  movements(@Query() query: StockMovementQueryDto) {
    return this.stock.movements(query.productId);
  }

  @Get('counts')
  @RequirePermission('shop', 'view')
  counts() {
    return this.stock.listCounts();
  }

  @Post('counts')
  @RequirePermission('shop', 'update')
  @ApiOperation({ summary: 'Sayım başlat: seçilen (ya da tüm aktif) ürünlerin beklenen stoku' })
  createCount(@Body() dto: CreateStockCountDto) {
    return this.stock.createCount(dto);
  }

  @Get('counts/:id')
  @RequirePermission('shop', 'view')
  count(@Param('id') id: string) {
    return this.stock.getCount(id);
  }

  @Patch('counts/:id')
  @RequirePermission('shop', 'update')
  updateCount(@Param('id') id: string, @Body() dto: UpdateStockCountDto) {
    return this.stock.updateCount(id, dto);
  }

  @Post('counts/:id/complete')
  @RequirePermission('shop', 'update')
  @ApiOperation({ summary: 'Sayımı tamamla: sayılan ürünlerin stoku sayılan miktara eşitlenir' })
  completeCount(@Param('id') id: string) {
    return this.stock.completeCount(id);
  }

  @Post('counts/:id/cancel')
  @RequirePermission('shop', 'update')
  cancelCount(@Param('id') id: string) {
    return this.stock.cancelCount(id);
  }

  @Get('purchase-orders')
  @RequirePermission('gymSuppliers', 'view')
  orders(@Query() query: PurchaseOrderQueryDto) {
    return this.stock.listOrders(query);
  }

  @Post('purchase-orders')
  @RequirePermission('gymSuppliers', 'create')
  createOrder(@Body() dto: CreatePurchaseOrderDto) {
    return this.stock.createOrder(dto);
  }

  @Get('purchase-orders/:id')
  @RequirePermission('gymSuppliers', 'view')
  order(@Param('id') id: string) {
    return this.stock.getOrder(id);
  }

  @Patch('purchase-orders/:id')
  @RequirePermission('gymSuppliers', 'update')
  updateOrder(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.stock.updateOrder(id, dto);
  }

  @Post('purchase-orders/:id/order')
  @RequirePermission('gymSuppliers', 'update')
  @ApiOperation({ summary: 'Taslak siparişi tedarikçiye gönderildi olarak işaretle' })
  markOrdered(@Param('id') id: string) {
    return this.stock.markOrdered(id);
  }

  @Post('purchase-orders/:id/receive')
  @RequirePermission('gymSuppliers', 'update')
  @ApiOperation({ summary: 'Mal kabul: stok artar, ürün maliyeti ve tedarikçi bakiyesi güncellenir' })
  receive(@Param('id') id: string, @Body() dto: ReceivePurchaseOrderDto) {
    return this.stock.receiveOrder(id, dto);
  }

  @Post('purchase-orders/:id/cancel')
  @RequirePermission('gymSuppliers', 'update')
  cancelOrder(@Param('id') id: string) {
    return this.stock.cancelOrder(id);
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { GymListQueryDto, GymRecordDto } from '../shared/ops.dto';
import { GymCommerceService } from './commerce.service';

const Guards = [FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard] as const;

@ApiTags('gym-documents')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/member-documents')
export class GymDocumentsController {
  constructor(private readonly commerce: GymCommerceService) {}

  @Get()
  @RequirePermission('memberDocuments', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.commerce.listDocuments(query);
  }

  @Post()
  @RequirePermission('memberDocuments', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.commerce.createDocument(dto);
  }

  @Patch(':id')
  @RequirePermission('memberDocuments', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.commerce.updateDocument(id, dto);
  }

  @Delete(':id')
  @RequirePermission('memberDocuments', 'delete')
  remove(@Param('id') id: string) {
    return this.commerce.removeDocument(id);
  }
}

@ApiTags('gym-wallet')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/wallet')
export class GymWalletController {
  constructor(private readonly commerce: GymCommerceService) {}

  @Get()
  @RequirePermission('wallet', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.commerce.listWallet(query);
  }

  @Post()
  @RequirePermission('wallet', 'create')
  adjust(@Body() dto: GymRecordDto) {
    return this.commerce.adjustWallet(dto);
  }

  @Post('purchase')
  @RequirePermission('wallet', 'create')
  purchase(@Body() dto: GymRecordDto) {
    return this.commerce.purchasePackage(dto);
  }
}

@ApiTags('gym-shop')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/shop')
export class GymShopController {
  constructor(private readonly commerce: GymCommerceService) {}


  @Get('expenses/analytics')
  @RequirePermission('accounting', 'view')
  getExpenseAnalytics(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.commerce.getExpenseAnalytics({ startDate, endDate, branchId });
  }

  @Get('categories')
  @RequirePermission('shop', 'view')
  categories(@Query() query: GymListQueryDto) {
    return this.commerce.listCategories(query);
  }

  @Post('categories')
  @RequirePermission('shop', 'create')
  createCategory(@Body() dto: GymRecordDto) {
    return this.commerce.createCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermission('shop', 'update')
  updateCategory(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.commerce.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermission('shop', 'delete')
  removeCategory(@Param('id') id: string) {
    return this.commerce.removeCategory(id);
  }

  @Get('products')
  @RequirePermission('shop', 'view')
  products(@Query() query: GymListQueryDto) {
    return this.commerce.listProducts(query);
  }

  @Post('products')
  @RequirePermission('shop', 'create')
  createProduct(@Body() dto: GymRecordDto) {
    return this.commerce.createProduct(dto);
  }

  @Patch('products/:id')
  @RequirePermission('shop', 'update')
  updateProduct(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.commerce.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @RequirePermission('shop', 'delete')
  removeProduct(@Param('id') id: string) {
    return this.commerce.removeProduct(id);
  }

  @Get('sales')
  @RequirePermission('shop', 'view')
  sales(@Query() query: GymListQueryDto) {
    return this.commerce.listSales(query);
  }

  @Post('checkout')
  @RequirePermission('shop', 'create')
  checkout(@Body() dto: GymRecordDto) {
    return this.commerce.checkout(dto);
  }

  @Post('sales/:id/refund')
  @RequirePermission('shop', 'update')
  refund(@Param('id') id: string) {
    return this.commerce.refundSale(id);
  }

  @Delete('sales/:id')
  @RequirePermission('shop', 'delete')
  removeSale(@Param('id') id: string) {
    return this.commerce.removeSale(id);
  }
}

@ApiTags('gym-suppliers')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/suppliers')
export class GymSuppliersController {
  constructor(private readonly commerce: GymCommerceService) {}

  @Get('categories')
  @RequirePermission('gymSuppliers', 'view')
  categories(@Query() query: GymListQueryDto) {
    return this.commerce.listSupplierCategories(query);
  }

  @Post('categories')
  @RequirePermission('gymSuppliers', 'create')
  createCategory(@Body() dto: GymRecordDto) {
    return this.commerce.createSupplierCategory(dto);
  }

  @Patch('categories/:id')
  @RequirePermission('gymSuppliers', 'update')
  updateCategory(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.commerce.updateSupplierCategory(id, dto);
  }

  @Delete('categories/:id')
  @RequirePermission('gymSuppliers', 'delete')
  removeCategory(@Param('id') id: string) {
    return this.commerce.removeSupplierCategory(id);
  }

  @Get()
  @RequirePermission('gymSuppliers', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.commerce.listSuppliers(query);
  }

  @Post()
  @RequirePermission('gymSuppliers', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.commerce.createSupplier(dto);
  }

  @Patch(':id')
  @RequirePermission('gymSuppliers', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.commerce.updateSupplier(id, dto);
  }

  @Delete(':id')
  @RequirePermission('gymSuppliers', 'delete')
  remove(@Param('id') id: string) {
    return this.commerce.removeSupplier(id);
  }
}

@ApiTags('gym-accounting')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/accounting')
export class GymAccountingController {
  constructor(private readonly commerce: GymCommerceService) {}

  @Get()
  @RequirePermission('accounting', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.commerce.listAccounting(query);
  }

  @Post()
  @RequirePermission('accounting', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.commerce.createAccounting(dto);
  }

  @Patch(':id')
  @RequirePermission('accounting', 'update')
  update(@Param('id') id: string, @Body() dto: GymRecordDto) {
    return this.commerce.updateAccounting(id, dto);
  }

  @Delete(':id')
  @RequirePermission('accounting', 'delete')
  remove(@Param('id') id: string) {
    return this.commerce.removeAccounting(id);
  }

  @Get('categories')
  @RequirePermission('accounting', 'view')
  categories(@Query() query: GymListQueryDto) {
    return this.commerce.listAccountingCategories(query);
  }

  @Post('categories')
  @RequirePermission('accounting', 'create')
  createCategory(@Body() dto: GymRecordDto) {
    return this.commerce.createAccountingCategory(dto);
  }

  @Delete('categories/:id')
  @RequirePermission('accounting', 'delete')
  removeCategory(@Param('id') id: string) {
    return this.commerce.removeAccountingCategory(id);
  }
}

@ApiTags('gym-einvoice')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(...Guards)
@Controller('gym/einvoice')
export class GymEinvoiceController {
  constructor(private readonly commerce: GymCommerceService) {}

  @Get('config')
  @Roles('owner', 'admin')
  @RequirePermission('eInvoice', 'view')
  config() {
    return this.commerce.getEinvoiceConfig();
  }

  @Patch('config')
  @Roles('owner', 'admin')
  @RequirePermission('eInvoice', 'update')
  saveConfig(@Body() dto: GymRecordDto) {
    return this.commerce.saveEinvoiceConfig(dto);
  }

  @Get('items')
  @RequirePermission('eInvoice', 'view')
  list(@Query() query: GymListQueryDto) {
    return this.commerce.listInvoices(query);
  }

  @Post('items')
  @RequirePermission('eInvoice', 'create')
  create(@Body() dto: GymRecordDto) {
    return this.commerce.createInvoice(dto);
  }

  @Delete('items/:id')
  @RequirePermission('eInvoice', 'delete')
  remove(@Param('id') id: string) {
    return this.commerce.removeInvoice(id);
  }
}

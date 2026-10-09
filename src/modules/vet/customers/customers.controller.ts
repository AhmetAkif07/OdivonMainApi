import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers.query.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CustomersService } from './customers.service';

@ApiTags('vet-customers')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()

  @RequirePermission('customers', 'view')
  @ApiOperation({ summary: 'List customers in the current tenant' })
  list(@Query() query: ListCustomersQueryDto) {
    return this.customers.list(query);
  }

  @Post()

  @RequirePermission('customers', 'create')
  @ApiOperation({ summary: 'Create a customer, optionally with an initial patient' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customers.create(dto);
  }

  @Get(':id')

  @RequirePermission('customers', 'view')
  @ApiOperation({ summary: 'Get customer by id' })
  get(@Param('id') id: string) {
    return this.customers.getById(id);
  }

  @Patch(':id')

  @RequirePermission('customers', 'update')
  @ApiOperation({ summary: 'Update a customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('customers', 'delete')
  @ApiOperation({ summary: 'Soft-delete a customer' })
  async remove(@Param('id') id: string) {
    await this.customers.softDelete(id);
    return { id };
  }

  @Post(':id/portal-access')
  @ApiOperation({ summary: 'Müşteri mobil portal erişimini aç/kapat veya parola güncelle' })
  async setPortalAccess(
    @Param('id') id: string,
    @Body() body: { portalAccess: boolean; password?: string; sendPortalInvite?: boolean },
  ) {
    return this.customers.setPortalAccess(id, body);
  }

}

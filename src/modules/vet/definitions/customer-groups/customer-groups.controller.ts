import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateCustomerGroupDto, UpdateCustomerGroupDto } from './customer-group.dto';
import { CustomerGroupsService } from './customer-groups.service';

@ApiTags('vet-customer-groups')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/customer-groups')
export class CustomerGroupsController {
  constructor(private readonly service: CustomerGroupsService) {}

  @Get()
  @ApiOperation({ summary: 'List customer groups' })
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()

  @RequirePermission('customerGroups', 'create')
  @ApiOperation({ summary: 'Create a customer group' })
  create(@Body() dto: CreateCustomerGroupDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get customer group by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')

  @RequirePermission('customerGroups', 'update')
  @ApiOperation({ summary: 'Update a customer group' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerGroupDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('customerGroups', 'delete')
  @ApiOperation({ summary: 'Soft-delete a customer group' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

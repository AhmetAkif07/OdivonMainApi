import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateSupplierDto, UpdateSupplierDto } from './supplier.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('vet-suppliers')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  @ApiOperation({ summary: 'List suppliers' })
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a supplier' })
  create(@Body() dto: CreateSupplierDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get supplier by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a supplier' })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a supplier' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateTaxDto, UpdateTaxDto } from './tax.dto';
import { TaxesService } from './taxes.service';

@ApiTags('vet-taxes')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/taxes')
export class TaxesController {
  constructor(private readonly service: TaxesService) {}

  @Get()
  @ApiOperation({ summary: 'List taxes' })
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a tax' })
  create(@Body() dto: CreateTaxDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tax by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a tax' })
  update(@Param('id') id: string, @Body() dto: UpdateTaxDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a tax' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

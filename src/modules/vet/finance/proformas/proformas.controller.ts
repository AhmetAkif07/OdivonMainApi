import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import {
  ConvertProformaDto,
  CreateProformaDto,
  ProformaQueryDto,
  SetProformaStatusDto,
  UpdateProformaDto,
} from './proforma.dto';
import { ProformasService } from './proformas.service';

@ApiTags('vet-proformas')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/proformas')
export class ProformasController {
  constructor(private readonly service: ProformasService) {}

  @Get()
  @RequirePermission('proformas', 'view')
  list(@Query() query: ProformaQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermission('proformas', 'create')
  create(@Body() dto: CreateProformaDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('proformas', 'view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Patch(':id')
  @RequirePermission('proformas', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateProformaDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Mark as sent, accepted or rejected' })
  @RequirePermission('proformas', 'update')
  setStatus(@Param('id') id: string, @Body() dto: SetProformaStatusDto) {
    return this.service.setStatus(id, dto);
  }

  @Post(':id/convert')
  @ApiOperation({ summary: 'Create a sale from the proforma' })
  @RequirePermission('sales', 'create')
  convert(@Param('id') id: string, @Body() dto: ConvertProformaDto) {
    return this.service.convert(id, dto);
  }

  @Delete(':id')
  @RequirePermission('proformas', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { id };
  }
}

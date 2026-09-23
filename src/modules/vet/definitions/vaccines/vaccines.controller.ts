import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateVaccineDto, UpdateVaccineDto } from './vaccine.dto';
import { VaccinesService } from './vaccines.service';

@ApiTags('vet-vaccines')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/vaccines')
export class VaccinesController {
  constructor(private readonly service: VaccinesService) {}

  @Get()
  @ApiOperation({ summary: 'List vaccine protocols' })
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @ApiOperation({ summary: 'Create a vaccine protocol' })
  create(@Body() dto: CreateVaccineDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vaccine protocol by id' })
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a vaccine protocol' })
  update(@Param('id') id: string, @Body() dto: UpdateVaccineDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a vaccine protocol' })
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateCollectionDto, ListCollectionsQueryDto, UpdateCollectionDto } from './collection.dto';
import { CollectionsService } from './collections.service';

@ApiTags('vet-collections')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/collections')
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  @Get()

  @RequirePermission('collections', 'view')
  list(@Query() query: ListCollectionsQueryDto) {
    return this.service.list(query);
  }

  @Post()

  @RequirePermission('collections', 'create')
  create(@Body() dto: CreateCollectionDto) {
    return this.service.create(dto);
  }

  @Get(':id')

  @RequirePermission('collections', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')

  @RequirePermission('collections', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')

  @RequirePermission('collections', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

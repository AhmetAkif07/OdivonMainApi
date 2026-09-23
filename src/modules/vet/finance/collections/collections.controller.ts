import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { RoleGuard } from '../../../../shared/authorization/role.guard';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateCollectionDto, ListCollectionsQueryDto, UpdateCollectionDto } from './collection.dto';
import { CollectionsService } from './collections.service';

@ApiTags('vet-collections')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard)
@Controller('vet/collections')
export class CollectionsController {
  constructor(private readonly service: CollectionsService) {}

  @Get()
  list(@Query() query: ListCollectionsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: CreateCollectionDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

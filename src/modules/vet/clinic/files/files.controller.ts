import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateFileItemDto, UpdateFileItemDto } from './file-item.dto';
import { FilesService } from './files.service';

@ApiTags('vet-files')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/files')
export class FilesController {
  constructor(private readonly service: FilesService) {}

  @Get()
  @RequirePermission('files', 'view')
  list(@Query() query: PagingQueryDto, @Query('parentId') parentId?: string) {
    return this.service.list(query, parentId);
  }

  @Post()
  @RequirePermission('files', 'create')
  create(@Body() dto: CreateFileItemDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('files', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @RequirePermission('files', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateFileItemDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('files', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

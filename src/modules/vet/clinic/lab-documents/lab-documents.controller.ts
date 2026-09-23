import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../../shared/authorization/require-permission.decorator';
import { PagingQueryDto } from '../../../../shared/http/paging.dto';
import { TenantGuard } from '../../../../shared/tenancy/tenant.guard';
import { CreateLabDocumentDto, UpdateLabDocumentDto } from './lab-document.dto';
import { LabDocumentsService } from './lab-documents.service';

@ApiTags('vet-lab-documents')
@ApiBearerAuth()
@RequireModule('vet')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('vet/lab-documents')
export class LabDocumentsController {
  constructor(private readonly service: LabDocumentsService) {}

  @Get()
  @RequirePermission('labDocuments', 'view')
  list(@Query() query: PagingQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @RequirePermission('labDocuments', 'create')
  create(@Body() dto: CreateLabDocumentDto) {
    return this.service.create(dto);
  }

  @Get(':id')
  @RequirePermission('labDocuments', 'view')
  get(@Param('id') id: string) {
    return this.service.getById(id);
  }

  @Patch(':id')
  @RequirePermission('labDocuments', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateLabDocumentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('labDocuments', 'delete')
  async remove(@Param('id') id: string) {
    await this.service.softDelete(id);
    return { id };
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreatePackageDto, ListPackagesQueryDto, UpdatePackageDto } from './package.dto';
import { PackagesService } from './packages.service';

@ApiTags('gym-packages')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('gym/packages')
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  @RequirePermission('packages', 'view')
  @ApiOperation({ summary: 'List gym packages' })
  list(@Query() query: ListPackagesQueryDto) {
    return this.packages.list(query);
  }

  @Post()
  @RequirePermission('packages', 'create')
  create(@Body() dto: CreatePackageDto) {
    return this.packages.create(dto);
  }

  @Get(':id')
  @RequirePermission('packages', 'view')
  get(@Param('id') id: string) {
    return this.packages.getById(id);
  }

  @Patch(':id')
  @RequirePermission('packages', 'update')
  update(@Param('id') id: string, @Body() dto: UpdatePackageDto) {
    return this.packages.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('packages', 'delete')
  remove(@Param('id') id: string) {
    return this.packages.remove(id);
  }
}

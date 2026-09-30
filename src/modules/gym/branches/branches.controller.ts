import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RoleGuard } from '../../../shared/authorization/role.guard';
import { Roles } from '../../../shared/authorization/roles.decorator';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { PagingQueryDto } from '../../../shared/http/paging.dto';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateBranchDto, UpdateBranchDto } from './branch.dto';
import { BranchesService } from './branches.service';

@ApiTags('gym-branches')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermission('branches', 'view')
  @ApiOperation({ summary: 'List gym branches' })
  list(@Query() query: PagingQueryDto) {
    return this.branches.list(query);
  }

  @Post()
  @Roles('owner', 'admin')
  @RequirePermission('branches', 'create')
  @ApiOperation({ summary: 'Create a gym branch' })
  create(@Body() dto: CreateBranchDto) {
    return this.branches.create(dto);
  }

  @Get(':id')
  @RequirePermission('branches', 'view')
  @ApiOperation({ summary: 'Get gym branch' })
  get(@Param('id') id: string) {
    return this.branches.getById(id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  @RequirePermission('branches', 'update')
  @ApiOperation({ summary: 'Update a gym branch' })
  update(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branches.update(id, dto);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @RequirePermission('branches', 'delete')
  @ApiOperation({ summary: 'Soft-delete a gym branch' })
  remove(@Param('id') id: string) {
    return this.branches.remove(id);
  }
}

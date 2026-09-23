import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import { CreateRoleDto, UpdateRoleDto } from './role.dto';
import { RolesService } from './roles.service';

@ApiTags('identity-roles')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard, TenantGuard, PermissionGuard)
@Controller('identity/roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission('roles', 'view')
  @ApiOperation({ summary: 'List roles in the current tenant' })
  list() {
    return this.roles.list();
  }

  @Get('lookup')
  @ApiOperation({ summary: 'Role ids and names for pickers' })
  lookup() {
    return this.roles.lookup();
  }

  @Post()
  @RequirePermission('roles', 'create')
  @ApiOperation({ summary: 'Create a role with a permission matrix' })
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Get(':id')
  @RequirePermission('roles', 'view')
  @ApiOperation({ summary: 'Get role by id' })
  get(@Param('id') id: string) {
    return this.roles.getById(id);
  }

  @Patch(':id')
  @RequirePermission('roles', 'update')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('roles', 'delete')
  @ApiOperation({ summary: 'Soft-delete a role that is not assigned to any user' })
  async remove(@Param('id') id: string) {
    await this.roles.softDelete(id);
    return { id };
  }
}

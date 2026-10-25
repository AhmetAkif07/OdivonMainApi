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
import { CreateStaffDto, UpdateStaffDto } from './staff.dto';
import { StaffService } from './staff.service';

@ApiTags('gym-staff')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, RoleGuard, PermissionGuard)
@Controller('gym/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @RequirePermission('staff', 'view')
  @ApiOperation({ summary: 'List gym staff' })
  list(@Query() query: PagingQueryDto) {
    return this.staff.list(query);
  }

  @Post()
  @Roles('owner', 'admin')
  @RequirePermission('staff', 'create')
  @ApiOperation({ summary: 'Create gym staff' })
  create(@Body() dto: CreateStaffDto) {
    return this.staff.create(dto);
  }

  @Get(':id')
  @RequirePermission('staff', 'view')
  get(@Param('id') id: string) {
    return this.staff.getById(id);
  }

  @Patch(':id')
  @Roles('owner', 'admin')
  @RequirePermission('staff', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateStaffDto) {
    return this.staff.update(id, dto);
  }

  @Post(':id/resend-invite')
  @Roles('owner', 'admin')
  @RequirePermission('staff', 'update')
  @ApiOperation({ summary: 'Resend invite and password setup link to staff' })
  resendInvite(@Param('id') id: string) {
    return this.staff.resendInvite(id);
  }

  @Delete(':id')
  @Roles('owner', 'admin')
  @RequirePermission('staff', 'delete')
  remove(@Param('id') id: string) {
    return this.staff.remove(id);
  }
}

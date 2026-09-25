import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../../shared/auth/firebase-auth.guard';
import { RequireModule } from '../../../shared/authorization/module.decorator';
import { ModuleGuard } from '../../../shared/authorization/module.guard';
import { PermissionGuard } from '../../../shared/authorization/permission.guard';
import { RequirePermission } from '../../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../../shared/tenancy/tenant.guard';
import {
  CancelMemberDto,
  CreateMemberDto,
  FreezeMemberDto,
  ListMembersQueryDto,
  RenewMemberDto,
  UpdateMemberDto,
} from './member.dto';
import { MembersService } from './members.service';

@ApiTags('gym-members')
@ApiBearerAuth()
@RequireModule('gym')
@UseGuards(FirebaseAuthGuard, TenantGuard, ModuleGuard, PermissionGuard)
@Controller('gym/members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('members', 'view')
  @ApiOperation({ summary: 'List gym members' })
  list(@Query() query: ListMembersQueryDto) {
    return this.members.list(query);
  }

  @Post()
  @RequirePermission('members', 'create')
  create(@Body() dto: CreateMemberDto) {
    return this.members.create(dto);
  }

  @Get(':id')
  @RequirePermission('members', 'view')
  get(@Param('id') id: string) {
    return this.members.getById(id);
  }

  @Patch(':id')
  @RequirePermission('members', 'update')
  update(@Param('id') id: string, @Body() dto: UpdateMemberDto) {
    return this.members.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('members', 'delete')
  remove(@Param('id') id: string) {
    return this.members.remove(id);
  }

  @Post(':id/renew')
  @RequirePermission('members', 'update')
  renew(@Param('id') id: string, @Body() dto: RenewMemberDto) {
    return this.members.renew(id, dto);
  }

  @Post(':id/freeze')
  @RequirePermission('members', 'update')
  freeze(@Param('id') id: string, @Body() dto: FreezeMemberDto) {
    return this.members.freeze(id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission('members', 'update')
  cancel(@Param('id') id: string, @Body() dto: CancelMemberDto) {
    return this.members.cancel(id, dto);
  }
}

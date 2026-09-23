import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { IdentityService } from './identity.service';

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new clinic tenant and owner user' })
  register(@Body() dto: RegisterDto) {
    return this.identity.register(dto);
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user from Firestore profile plus tenant summary and permissions' })
  me() {
    return this.identity.me();
  }

  @Get('permission-catalog')
  @UseGuards(FirebaseAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Screens and actions that can be granted to roles' })
  permissionCatalog() {
    return this.identity.permissionCatalog();
  }

  @Get('users')
  @UseGuards(FirebaseAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('users', 'view')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users in the current tenant' })
  users() {
    return this.identity.listUsers();
  }

  @Get('users/lookup')
  @UseGuards(FirebaseAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Active users for pickers (uid, displayName, email)' })
  lookupUsers() {
    return this.identity.lookupUsers();
  }

  @Post('users')
  @UseGuards(FirebaseAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('users', 'create')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a user in the current tenant with a password and roles' })
  createUser(@Body() dto: CreateUserDto) {
    return this.identity.createUser(dto);
  }

  @Patch('users/:uid')
  @UseGuards(FirebaseAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('users', 'update')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update display name, roles, status or password of a user' })
  updateUser(@Param('uid') uid: string, @Body() dto: UpdateUserDto) {
    return this.identity.updateUser(uid, dto);
  }

  @Delete('users/:uid')
  @UseGuards(FirebaseAuthGuard, TenantGuard, PermissionGuard)
  @RequirePermission('users', 'delete')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate a user' })
  async deleteUser(@Param('uid') uid: string) {
    await this.identity.deactivateUser(uid);
    return { uid };
  }
}

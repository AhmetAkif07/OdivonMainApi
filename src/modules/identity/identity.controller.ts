import { Body, Controller, Delete, Get, Injectable, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { PermissionGuard } from '../../shared/authorization/permission.guard';
import { RequirePermission } from '../../shared/authorization/require-permission.decorator';
import { Throttle } from '@nestjs/throttler';
import { ClientThrottlerGuard } from '../../shared/http/client-throttler.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto, UpdateMeDto, UpdateUserDto } from './dto/user.dto';
import { VerifyEmailDto, ResendVerificationDto } from './dto/verify-email.dto';
import { IdentityService } from './identity.service';

/** Rate-limits registration per client IP, also outside production where the global guard is off. */
@Injectable()
export class RegisterThrottlerGuard extends ClientThrottlerGuard {}

@ApiTags('identity')
@Controller('identity')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Post('register')
  @UseGuards(RegisterThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @ApiOperation({ summary: 'Register a new clinic tenant and owner user' })
  register(@Body() dto: RegisterDto) {
    return this.identity.register(dto);
  }

  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email address with token' })
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.identity.verifyEmail(dto.token);
  }

  // TODO: temporarily unthrottled for mail testing. Restore before real traffic:
  //   @UseGuards(RegisterThrottlerGuard)
  //   @Throttle({ default: { limit: 5, ttl: 900_000 } })
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification link' })
  resendVerification(@Body() dto: ResendVerificationDto) {
    return this.identity.resendVerification(dto.email);
  }

  @Get('me')
  @UseGuards(FirebaseAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user from Firestore profile plus tenant summary and permissions' })
  me() {
    return this.identity.me();
  }

  @Patch('me')
  @UseGuards(FirebaseAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user display name or phone' })
  updateMe(@Body() dto: UpdateMeDto) {
    return this.identity.updateMe(dto);
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

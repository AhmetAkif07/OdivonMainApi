import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FirebaseAuthGuard } from '../../shared/auth/firebase-auth.guard';
import { RoleGuard } from '../../shared/authorization/role.guard';
import { TenantGuard } from '../../shared/tenancy/tenant.guard';
import { RegisterDto } from './dto/register.dto';
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
  @UseGuards(FirebaseAuthGuard, TenantGuard, RoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user from Firestore profile plus tenant summary' })
  me() {
    return this.identity.me();
  }

  @Get('users')
  @UseGuards(FirebaseAuthGuard, TenantGuard, RoleGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List users in the current tenant' })
  users() {
    return this.identity.listUsers();
  }
}

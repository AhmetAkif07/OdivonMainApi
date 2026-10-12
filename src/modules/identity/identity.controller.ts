import { Body, Controller, Delete, Get, HttpException, Injectable, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
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

  /** Shared confirmation page for products that do not yet have their own verification screen. */
  @Get('verification')
  verificationPage(@Query('token') token: string | undefined, @Res() response: Response) {
    setVerificationHeaders(response);
    const validToken = typeof token === 'string' && /^[a-f0-9]{64}$/i.test(token);
    return response.status(validToken ? 200 : 400).type('html').send(
      verificationHtml(validToken ? 'pending' : 'invalid', validToken ? token : undefined),
    );
  }

  @Post('verification/confirm')
  async confirmVerification(@Query('token') token: string | undefined, @Res() response: Response) {
    setVerificationHeaders(response);
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
      return response.status(400).type('html').send(verificationHtml('invalid'));
    }
    try {
      await this.identity.verifyEmail(token);
      return response.status(200).type('html').send(verificationHtml('verified'));
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      return response.status(status).type('html').send(verificationHtml(status === 503 ? 'temporary-error' : 'invalid'));
    }
  }

  @Post('resend-verification')
  @UseGuards(RegisterThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 900_000 } })
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

function setVerificationHeaders(response: Response): void {
  response.set('Cache-Control', 'no-store');
  response.set('Referrer-Policy', 'no-referrer');
}

function verificationHtml(state: 'pending' | 'verified' | 'invalid' | 'temporary-error', token?: string): string {
  const content = {
    pending: '<h1>E-posta adresinizi doğrulayın</h1><p>Hesabınızın e-posta adresini onaylamak için aşağıdaki düğmeye basın.</p>',
    verified: '<h1>E-posta adresiniz doğrulandı</h1><p>Artık kayıt olduğunuz Odivon uygulamasına dönüp giriş yapabilirsiniz.</p>',
    invalid: '<h1>Bağlantı geçersiz veya süresi dolmuş</h1><p>Uygulamanızdan yeni bir doğrulama bağlantısı isteyin.</p>',
    'temporary-error': '<h1>Doğrulama tamamlanamadı</h1><p>Lütfen biraz sonra aynı bağlantıyı yeniden deneyin.</p>',
  }[state];
  const form = state === 'pending' && token
    ? `<form method="post" action="/api/v1/identity/verification/confirm?token=${encodeURIComponent(token)}"><button type="submit">E-postamı doğrula</button></form>`
    : '';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Odivon | E-posta doğrulama</title></head><body><main>${content}${form}</main></body></html>`;
}

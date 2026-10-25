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
import { CreateUserDto, ChangePasswordDto, UpdateMeDto, UpdateUserDto } from './dto/user.dto';
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

  @Post('logout')
  @ApiOperation({ summary: 'Expire server-side product session cookies' })
  logout(@Res({ passthrough: true }) response: Response) {
    for (const cookie of ['odivon-rentacar-session', 'odivon-rentacar-csrf']) {
      response.clearCookie(cookie, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
    }
    return { loggedOut: true };
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

  @Post('change-password')
  @UseGuards(FirebaseAuthGuard, TenantGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change current user password' })
  changePassword(@Body() dto: ChangePasswordDto) {
    return this.identity.changePassword(dto);
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
  const currentYear = new Date().getFullYear();

  let badge = '';
  let iconHtml = '';
  let title = '';
  let description = '';
  let actionHtml = '';

  if (state === 'pending') {
    badge = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(99,102,241,0.15); color: #818cf8; border: 1px solid rgba(99,102,241,0.3); margin-bottom: 16px;">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #6366f1; box-shadow: 0 0 8px #6366f1;"></span>
        GÜVENLİ DOĞRULAMA
      </span>
    `;
    iconHtml = `
      <div style="position: relative; width: 72px; height: 72px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 24px; background: rgba(99,102,241,0.25); filter: blur(14px);"></div>
        <div style="position: relative; width: 72px; height: 72px; border-radius: 24px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(99,102,241,0.35); border: 1px solid rgba(255,255,255,0.2);">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        </div>
      </div>
    `;
    title = 'E-posta adresinizi doğrulayın';
    description = 'Hesabınızın e-posta adresini onaylamak için aşağıdaki düğmeye basın.';
    if (token) {
      actionHtml = `
        <form method="post" action="/api/v1/identity/verification/confirm?token=${encodeURIComponent(token)}" style="margin-top: 24px;">
          <button type="submit" style="width: 100%; padding: 14px 24px; border: none; border-radius: 14px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%); color: #ffffff; font-size: 14px; font-weight: 800; letter-spacing: 0.02em; cursor: pointer; box-shadow: 0 10px 25px rgba(99,102,241,0.35); transition: transform 0.15s ease, box-shadow 0.15s ease; font-family: inherit;">
            E-postamı doğrula
          </button>
        </form>
      `;
    }
  } else if (state === 'verified') {
    badge = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(16,185,129,0.15); color: #34d399; border: 1px solid rgba(16,185,129,0.3); margin-bottom: 16px;">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span>
        BAŞARILI
      </span>
    `;
    iconHtml = `
      <div style="position: relative; width: 76px; height: 76px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 24px; background: rgba(16,185,129,0.25); filter: blur(16px);"></div>
        <div style="position: relative; width: 76px; height: 76px; border-radius: 24px; background: linear-gradient(135deg, #10b981 0%, #0d9488 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(16,185,129,0.35); border: 1px solid rgba(255,255,255,0.25);">
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        </div>
      </div>
    `;
    title = 'E-posta adresiniz doğrulandı';
    description = 'Artık kayıt olduğunuz Odivon uygulamasına dönüp giriş yapabilirsiniz.';
    actionHtml = `
      <div style="margin-top: 24px;">
        <a href="/" style="display: block; width: 100%; box-sizing: border-box; text-decoration: none; padding: 14px 24px; border-radius: 14px; background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); color: #ffffff; font-size: 14px; font-weight: 800; letter-spacing: 0.02em; cursor: pointer; box-shadow: 0 10px 25px rgba(99,102,241,0.35); text-align: center; font-family: inherit;">
          Uygulamaya Git & Giriş Yap →
        </a>
      </div>
    `;
  } else if (state === 'invalid') {
    badge = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(244,63,94,0.15); color: #fb7185; border: 1px solid rgba(244,63,94,0.3); margin-bottom: 16px;">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #f43f5e; box-shadow: 0 0 8px #f43f5e;"></span>
        HATA
      </span>
    `;
    iconHtml = `
      <div style="position: relative; width: 72px; height: 72px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 24px; background: rgba(244,63,94,0.25); filter: blur(14px);"></div>
        <div style="position: relative; width: 72px; height: 72px; border-radius: 24px; background: linear-gradient(135deg, #f43f5e 0%, #ea580c 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(244,63,94,0.35); border: 1px solid rgba(255,255,255,0.2);">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
      </div>
    `;
    title = 'Bağlantı geçersiz veya süresi dolmuş';
    description = 'Uygulamanızdan yeni bir doğrulama bağlantısı isteyin.';
  } else {
    badge = `
      <span style="display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; background: rgba(245,158,11,0.15); color: #fbbf24; border: 1px solid rgba(245,158,11,0.3); margin-bottom: 16px;">
        <span style="width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; box-shadow: 0 0 8px #f59e0b;"></span>
        GEÇİCİ SORUN
      </span>
    `;
    iconHtml = `
      <div style="position: relative; width: 72px; height: 72px; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 24px; background: rgba(245,158,11,0.25); filter: blur(14px);"></div>
        <div style="position: relative; width: 72px; height: 72px; border-radius: 24px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 25px rgba(245,158,11,0.35); border: 1px solid rgba(255,255,255,0.2);">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
      </div>
    `;
    title = 'Doğrulama tamamlanamadı';
    description = 'Lütfen biraz sonra aynı bağlantıyı yeniden deneyin.';
  }

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Odivon | E-posta doğrulama</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: #0b1120;
      color: #ffffff;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      position: relative;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .ambient-orb-1 {
      position: absolute;
      top: -100px;
      left: -100px;
      width: 480px;
      height: 480px;
      background: radial-gradient(circle, rgba(147, 51, 234, 0.28) 0%, rgba(225, 29, 72, 0.16) 45%, transparent 70%);
      border-radius: 50%;
      filter: blur(90px);
      pointer-events: none;
    }
    .ambient-orb-2 {
      position: absolute;
      bottom: -100px;
      right: -100px;
      width: 480px;
      height: 480px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.25) 0%, rgba(2, 132, 199, 0.16) 50%, transparent 70%);
      border-radius: 50%;
      filter: blur(100px);
      pointer-events: none;
    }
    .grid-bg {
      position: absolute;
      inset: 0;
      background-image: radial-gradient(#6366f1 1px, transparent 1px);
      background-size: 24px 24px;
      opacity: 0.08;
      pointer-events: none;
    }
    .card-container {
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 440px;
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      padding: 36px 32px;
      text-align: center;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(99, 102, 241, 0.5) !important;
    }
    button:active {
      transform: scale(0.99);
    }
    a:hover {
      transform: translateY(-2px);
      box-shadow: 0 14px 30px rgba(99, 102, 241, 0.5) !important;
    }
  </style>
</head>
<body>
  <div class="ambient-orb-1" aria-hidden="true"></div>
  <div class="ambient-orb-2" aria-hidden="true"></div>
  <div class="grid-bg" aria-hidden="true"></div>

  <main class="card-container">
    <!-- Brand Logo Header -->
    <div style="display: flex; align-items: center; justify-content: center; gap: 12px; margin-bottom: 28px;">
      <div style="position: relative; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center;">
        <span style="position: absolute; inset: -15%; border-radius: 50%; background: radial-gradient(circle, rgba(99,102,241,0.5), transparent 70%); filter: blur(10px);"></span>
        <svg viewBox="0 0 64 64" width="44" height="44" style="position: relative; filter: drop-shadow(0 4px 10px rgba(99,102,241,0.4));">
          <defs>
            <linearGradient id="logoGrad" x1="10%" y1="0%" x2="90%" y2="100%">
              <stop offset="0%" stop-color="#93c5fd"/>
              <stop offset="55%" stop-color="#917aff"/>
              <stop offset="100%" stop-color="#5b21b6"/>
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="32" rx="15" ry="19" transform="rotate(35 32 32)" fill="none" stroke="url(#logoGrad)" stroke-width="8" stroke-linecap="round"/>
        </svg>
      </div>
      <div style="text-align: left;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-weight: 900; font-size: 20px; letter-spacing: -0.5px; color: #ffffff;">ODIVON</span>
          <span style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; padding: 2px 6px; border-radius: 6px; background: rgba(99,102,241,0.2); color: #a5b4fc; border: 1px solid rgba(99,102,241,0.3);">PLATFORM</span>
        </div>
        <span style="font-size: 10px; font-weight: 600; color: #94a3b8; display: block; margin-top: -2px;">Bulut Yönetim Platformu</span>
      </div>
    </div>

    ${iconHtml}
    ${badge}
    <h1 style="font-size: 21px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; margin: 0 0 10px;">${title}</h1>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin: 0; max-width: 360px; margin-left: auto; margin-right: auto;">${description}</p>
    ${actionHtml}
  </main>

  <footer style="margin-top: 24px; text-align: center; font-size: 12px; color: #64748b; position: relative; z-index: 10;">
    © ${currentYear} Odivon. Tüm hakları saklıdır.
  </footer>
</body>
</html>`;
}

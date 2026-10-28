import { Body, Controller, Injectable, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Request } from 'express';
import { FirebaseAuthGuard, getDecodedToken } from '../../../shared/auth/firebase-auth.guard';
import { ProductModule } from '../../../shared/authorization/constants';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { MailService } from '../../../shared/mail/mail.service';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { hairInvalid, hairPrecondition } from '../shared/hair-errors';

export class HairOnboardingDto {
  @ApiProperty()
  @IsString()
  @Length(1, 120)
  businessName!: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  ownerName!: string;
}

/**
 * Onboarding for a Firebase user who signed in on the client but has no MainApi profile yet:
 * creates a hair tenant and makes the caller its owner.
 */
@Injectable()
export class HairOnboardingService {
  private readonly logger = new Logger(HairOnboardingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
    private readonly mail: MailService,
  ) {}

  async onboard(uid: string, email: string | undefined, dto: HairOnboardingDto) {
    if (!email) throw hairInvalid('Hesabın e-posta adresi yok.');
    if (await this.users.findByUid(uid)) {
      throw hairPrecondition('Bu kullanıcı zaten bir işletmeye bağlı.');
    }

    const modules: ProductModule[] = ['hair'];
    const tenant = await this.tenants.create({
      name: dto.businessName.trim(),
      ownerUid: uid,
      modules,
    });
    try {
      const now = new Date().toISOString();
      await this.users.createProfile({
        uid,
        tenantId: tenant.id,
        role: 'owner',
        modules,
        email: email.trim().toLowerCase(),
        displayName: dto.ownerName.trim(),
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId: tenant.id,
        role: 'owner',
        modules,
      });
    } catch (error) {
      await this.users.hardDelete(uid).catch((err) => this.logger.error(err));
      await this.tenants.hardDelete(tenant.id).catch((err) => this.logger.error(err));
      throw error;
    }
    this.mail
      .sendModuleWelcome({
        module: 'hair',
        to: email,
        displayName: dto.ownerName,
        tenantName: dto.businessName,
      })
      ?.catch((err) => this.logger.error(`Hoş geldin maili gönderilemedi (${email}): ${err?.message || err}`));
    return { tenantId: tenant.id };
  }
}

@ApiTags('hair')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('hair/onboarding')
export class HairOnboardingController {
  constructor(private readonly onboarding: HairOnboardingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a hair tenant for a signed-in Firebase user without a profile' })
  onboard(@Req() request: Request, @Body() dto: HairOnboardingDto) {
    const token = getDecodedToken(request);
    return this.onboarding.onboard(token.uid, token.email, dto);
  }
}

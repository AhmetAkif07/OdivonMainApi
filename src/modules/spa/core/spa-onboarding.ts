import { Body, Controller, Injectable, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Request } from 'express';
import { FirebaseAuthGuard, getDecodedToken } from '../../../shared/auth/firebase-auth.guard';
import { ProductModule } from '../../../shared/authorization/constants';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { spaInvalid, spaPrecondition } from '../shared/spa-errors';

export class SpaOnboardingDto {
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
 * Onboarding for a Firebase user who signed in on the client (e-mail or Google) but has no
 * MainApi profile yet: creates a spa tenant and makes the caller its owner.
 */
@Injectable()
export class SpaOnboardingService {
  private readonly logger = new Logger(SpaOnboardingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
  ) {}

  async onboard(uid: string, email: string | undefined, dto: SpaOnboardingDto) {
    if (!email) throw spaInvalid('Hesabın e-posta adresi yok.');
    if (await this.users.findByUid(uid)) {
      throw spaPrecondition('Bu kullanıcı zaten bir işletmeye bağlı.');
    }

    const modules: ProductModule[] = ['spa'];
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
    return { tenantId: tenant.id };
  }
}

@ApiTags('spa')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('spa/onboarding')
export class SpaOnboardingController {
  constructor(private readonly onboarding: SpaOnboardingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a spa tenant for a signed-in Firebase user without a profile' })
  onboard(@Req() request: Request, @Body() dto: SpaOnboardingDto) {
    const token = getDecodedToken(request);
    return this.onboarding.onboard(token.uid, token.email, dto);
  }
}

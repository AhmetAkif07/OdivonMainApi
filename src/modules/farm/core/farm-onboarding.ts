import { Body, Controller, Injectable, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { FirebaseAuthGuard, getDecodedToken } from '../../../shared/auth/firebase-auth.guard';
import { ProductModule } from '../../../shared/authorization/constants';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import {
  TENANT_COLLECTION,
  tenantCollectionPath,
} from '../../../shared/firebase/firestore-path';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { farmInvalid, farmPrecondition } from '../shared/farm-errors';
import { trialSubscription } from '../shared/farm-plans';
import { FarmOnboardingDto } from './farm-core.dto';
import { ownerMemberCard } from './farm-core.service';

/**
 * Onboarding for a Firebase user who signed up on the OdivonFARM client but has no MainApi
 * profile yet: creates a farm tenant (14-day trial) and makes the caller its owner/admin.
 */
@Injectable()
export class FarmOnboardingService {
  private readonly logger = new Logger(FarmOnboardingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
  ) {}

  async onboard(uid: string, email: string | undefined, dto: FarmOnboardingDto) {
    if (!email) throw farmInvalid('Hesabın e-posta adresi yok.');
    if (await this.users.findByUid(uid)) {
      throw farmPrecondition('Bu kullanıcı zaten bir işletmeye bağlı.');
    }

    const modules: ProductModule[] = ['farm'];
    const subscriptionTemplate = trialSubscription('');
    const tenant = await this.tenants.create({
      name: dto.farmName.trim(),
      ownerUid: uid,
      modules,
      membershipStatus: 'trial',
      trialEndsAt: subscriptionTemplate.trialEndsAt,
    });
    const cleanEmail = email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    const db = this.firebase.db;
    const path = (name: string) => tenantCollectionPath(tenant.id, name);
    try {
      const now = new Date().toISOString();
      await this.users.createProfile({
        uid,
        tenantId: tenant.id,
        role: 'owner',
        modules,
        email: cleanEmail,
        displayName,
        phone: dto.phone?.trim() || null,
        status: 'active',
        membershipStatus: 'trial',
        trialStartedAt: now,
        trialEndsAt: subscriptionTemplate.trialEndsAt,
        createdAt: now,
        updatedAt: now,
      });
      const batch = db.batch();
      batch.set(db.collection(path(TENANT_COLLECTION.farmSettings)).doc(tenant.id), {
        phone: dto.phone?.trim() ?? '',
        countryCode: dto.countryCode ?? '',
        country: dto.country ?? '',
        language: dto.language ?? 'tr',
        address: '',
        createdAt: now,
        updatedAt: now,
        updatedBy: uid,
      });
      batch.set(
        db.collection(path(TENANT_COLLECTION.farmMembers)).doc(uid),
        ownerMemberCard(tenant.id, uid, cleanEmail, displayName, dto.phone?.trim() ?? ''),
      );
      batch.set(
        db.collection(path(TENANT_COLLECTION.farmSubscription)).doc(tenant.id),
        trialSubscription(tenant.id),
      );
      await batch.commit();
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

@ApiTags('farm')
@ApiBearerAuth()
@UseGuards(FirebaseAuthGuard)
@Controller('farm/onboarding')
export class FarmOnboardingController {
  constructor(private readonly onboarding: FarmOnboardingService) {}

  @Post()
  @ApiOperation({ summary: 'Create a farm tenant for a signed-in Firebase user without a profile' })
  onboard(@Req() request: Request, @Body() dto: FarmOnboardingDto) {
    const token = getDecodedToken(request);
    return this.onboarding.onboard(token.uid, token.email, dto);
  }
}

import * as crypto from 'crypto';
import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantService } from '../tenant/tenant.service';
import { IdentityRepository } from './identity.repository';
import { RegisterDto } from './dto/register.dto';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { UserProfile } from './entities/user-profile.entity';
import { TenantContext } from '../../shared/tenancy/tenant.context';
import {
  fullPermissionMap,
  PERMISSION_ACTIONS,
  PERMISSION_GROUP_LABELS,
  resourcesForModules,
} from '../../shared/authorization/permissions';
import { ProductModule } from '../../shared/authorization/constants';
import { effectiveSubscription, TenantBillingState } from '../payments/saas-billing';
import { RolesService } from './roles/roles.service';
import { MailService } from '../../shared/mail/mail.service';
import { WelcomeModule } from '../../shared/mail/welcome-templates';

const SAAS_TRIAL_DAYS = 14;

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
    private readonly tenantContext: TenantContext,
    private readonly roles: RolesService,
    private readonly mail: MailService,
  ) {}

  async register(dto: RegisterDto) {
    let uid: string | undefined;
    let tenantId: string | undefined;
    let profileCreated = false;

    try {
      const userRecord = await this.firebase.auth.createUser({
        email: dto.email,
        password: dto.password,
      });
      uid = userRecord.uid;

      const productModule: ProductModule = dto.module ?? 'vet';
      const modules: ProductModule[] = [productModule];
      const now = new Date();
      const nowIso = now.toISOString();
      const trialEndsAt = new Date(now.getTime() + SAAS_TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

      const isGym = modules.includes('gym');
      const createdTenant = await this.tenants.create({
        name: dto.tenantName,
        ownerUid: uid,
        modules,
        onboardingCompleted: !isGym,
        membershipStatus: 'trial',
        trialEndsAt,
      });
      tenantId = createdTenant.id;

      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const profile: UserProfile = {
        uid,
        tenantId: createdTenant.id,
        role: 'owner',
        modules,
        email: dto.email,
        emailVerified: false,
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiresAt,
        displayName: dto.displayName?.trim() || null,
        phone: dto.phone?.trim() || null,
        status: 'active',
        membershipStatus: 'trial',
        trialStartedAt: nowIso,
        trialEndsAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await this.users.createProfile(profile);
      profileCreated = true;

      if (dto.displayName?.trim()) {
        await this.firebase.auth.updateUser(uid, { displayName: dto.displayName.trim() });
      }

      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId: createdTenant.id,
        role: 'owner',
        modules,
      });

      const verificationLink = verificationUrl(productModule, verificationToken);

      this.mail
        .sendVerificationEmail({
          to: dto.email,
          displayName: dto.displayName,
          tenantName: dto.tenantName,
          verificationLink,
          module: productModule,
        })
        ?.catch((err) => {
          this.logger.error(
            `Doğrulama maili gönderilemedi (${dto.email}): ${err?.message || err}`,
          );
        });

      return {
        uid,
        email: dto.email,
        tenantId: createdTenant.id,
        role: 'owner' as const,
        modules,
      };
    } catch (error) {
      await this.rollbackRegister({ uid, tenantId, profileCreated });
      if (error instanceof AppException) {
        throw error;
      }
      throw mapFirebaseUserError(error, this.logger, 'Registration failed');
    }
  }

  async verifyEmail(token: string) {
    const profile = await this.users.findByVerificationToken(token);
    if (!profile) {
      throw new AppException(
        ErrorCode.VERIFICATION_TOKEN_INVALID,
        'Geçersiz veya bulunamayan e-posta doğrulama bağlantısı.',
      );
    }

    if (
      profile.emailVerificationExpiresAt &&
      new Date(profile.emailVerificationExpiresAt).getTime() < Date.now()
    ) {
      throw new AppException(
        ErrorCode.VERIFICATION_TOKEN_EXPIRED,
        'Doğrulama bağlantısının süresi dolmuş. Lütfen yeni bir bağlantı isteyin.',
      );
    }

    try {
      await this.firebase.auth.updateUser(profile.uid, { emailVerified: true });
    } catch (err) {
      this.logger.error(`Firebase Auth emailVerified güncellenemedi (${profile.uid})`, err);
      throw new ServiceUnavailableException('E-posta doğrulaması şu anda tamamlanamıyor. Lütfen tekrar deneyin.');
    }

    const nowIso = new Date().toISOString();
    await this.users.updateProfile(profile.uid, {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiresAt: null,
      updatedAt: nowIso,
    });

    const tenant = await this.tenants.getById(profile.tenantId).catch(() => null);
    const tenantName = tenant?.name || (profile.modules.includes('gym') ? 'Spor Salonu' : 'İşletme');

    if (profile.modules.includes('gym')) {
      this.mail
        .sendWelcomeGymOwner({
          to: profile.email,
          displayName: profile.displayName,
          tenantName,
        })
        ?.catch((err) => {
          this.logger.error(`Hoş geldin maili gönderilemedi (${profile.email}): ${err?.message || err}`);
        });
    } else {
      const primaryModule = (profile.modules[0] || 'vet') as WelcomeModule;
      this.mail
        .sendModuleWelcome({
          module: primaryModule,
          to: profile.email,
          displayName: profile.displayName,
          tenantName,
          trialDays: SAAS_TRIAL_DAYS,
        })
        ?.catch((err) => {
          this.logger.error(`Hoş geldin maili gönderilemedi (${profile.email}): ${err?.message || err}`);
        });
    }

    return { success: true, email: profile.email };
  }

  async resendVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const profile = await this.users.findByEmail(normalizedEmail);
    if (!profile || profile.emailVerified) {
      return { success: true };
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await this.users.updateProfile(profile.uid, {
      emailVerificationToken: verificationToken,
      emailVerificationExpiresAt: verificationExpiresAt,
      updatedAt: new Date().toISOString(),
    });

    const tenant = await this.tenants.getById(profile.tenantId).catch(() => null);
    const productModule = profile.modules[0] ?? 'vet';
    const verificationLink = verificationUrl(productModule, verificationToken);

    let sent = false;
    try {
      sent = await this.mail.sendVerificationEmail({
        to: profile.email,
        displayName: profile.displayName,
        tenantName: tenant?.name || (productModule === 'gym' ? 'Spor Salonu' : 'İşletme'),
        verificationLink,
        module: productModule,
      });
    } catch (error) {
      this.logger.error(`Doğrulama maili tekrar gönderilemedi (${profile.email}): ${error instanceof Error ? error.message : error}`);
    }
    if (!sent) {
      throw new ServiceUnavailableException('Doğrulama e-postası şu anda gönderilemiyor. Lütfen daha sonra tekrar deneyin.');
    }

    return { success: true };
  }

  async me() {
    const store = this.tenantContext.getStore();
    const profile = await this.users.findByUid(store.userId);
    if (!profile) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User profile was not found');
    }
    if (profile.emailVerified !== true) {
      const fbUser = await this.firebase.auth.getUser(store.userId).catch(() => null);
      if (fbUser?.emailVerified) {
        profile.emailVerified = true;
        await this.users
          .updateProfile(store.userId, {
            emailVerified: true,
            emailVerificationToken: null,
            emailVerificationExpiresAt: null,
            updatedAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }
    }
    const tenant = await this.tenants.getById(profile.tenantId);
    // A paid gym stays active through the grace period after its end date (see saas-billing).
    const billing = effectiveSubscription(tenant as TenantBillingState);
    return {
      uid: profile.uid,
      email: profile.email,
      displayName: profile.displayName ?? null,
      phone: profile.phone ?? null,
      tenantId: profile.tenantId,
      role: profile.role,
      accountType: profile.accountType ?? null,
      modules: profile.modules,
      roleIds: profile.roleIds ?? [],
      emailVerified: profile.emailVerified ?? null,
      branchIds: profile.branchIds ?? [],
      allBranches: profile.role === 'owner' || profile.allBranches === true,
      membershipStatus: tenant.membershipStatus ? billing.membershipStatus : (profile.membershipStatus ?? 'active'),
      trialEndsAt: tenant.trialEndsAt ?? profile.trialEndsAt ?? null,
      onboardingCompleted: tenant.onboardingCompleted ?? false,
      permissions: profile.role === 'owner' ? fullPermissionMap(profile.modules ?? []) : (store.permissions ?? {}),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
        onboardingCompleted: tenant.onboardingCompleted ?? false,
        membershipStatus: tenant.membershipStatus ? billing.membershipStatus : 'active',
        trialEndsAt: tenant.trialEndsAt ?? null,
        subscriptionEndsAt: billing.subscriptionEndsAt,
        graceEndsAt: billing.graceEndsAt,
        inGrace: billing.inGrace,
      },
    };
  }

  async updateMe(dto: { displayName?: string; phone?: string }): Promise<UserProfile> {
    const store = this.tenantContext.getStore();
    const current = await this.users.findByUid(store.userId);
    if (!current) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User profile was not found');
    }
    const patch: Partial<UserProfile> = {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (dto.displayName !== undefined) {
      await this.firebase.auth.updateUser(store.userId, { displayName: dto.displayName.trim() });
    }
    await this.users.updateProfile(store.userId, patch);
    return { ...current, ...patch };
  }

  async listUsers(): Promise<UserProfile[]> {
    const users = await this.users.listByCurrentTenant();
    return users
      .map((user) => ({
        ...user,
        displayName: user.displayName ?? null,
        roleIds: user.roleIds ?? [],
        branchIds: user.branchIds ?? [],
        allBranches: user.role === 'owner' || user.allBranches === true,
      }))
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async lookupUsers() {
    const users = await this.users.listByCurrentTenant();
    return users
      .filter((user) => user.status === 'active')
      .map((user) => ({ uid: user.uid, displayName: user.displayName || user.email, email: user.email }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName, 'tr'));
  }

  permissionCatalog() {
    const modules = this.tenantContext.getStore().modules ?? [];
    const resources = resourcesForModules(modules);
    const groupKeys = new Set(resources.map((resource) => resource.group));
    return {
      actions: PERMISSION_ACTIONS,
      groups: Object.entries(PERMISSION_GROUP_LABELS)
        .filter(([key]) => groupKeys.has(key as keyof typeof PERMISSION_GROUP_LABELS))
        .map(([key, label]) => ({ key, label })),
      resources,
    };
  }

  async createUser(dto: CreateUserDto): Promise<UserProfile> {
    const store = this.tenantContext.getStore();
    const roleIds = await this.roles.assertRolesExist(dto.roleIds);
    let uid: string | undefined;
    let profileCreated = false;

    try {
      const userRecord = await this.firebase.auth.createUser({
        email: dto.email,
        password: dto.password,
        displayName: dto.displayName,
      });
      uid = userRecord.uid;

      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid,
        tenantId: store.tenantId,
        role: 'user',
        modules: store.modules,
        email: dto.email,
        displayName: dto.displayName.trim(),
        roleIds,
        branchIds: dto.branchIds ?? [],
        allBranches: false,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      profileCreated = true;

      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId: store.tenantId,
        role: 'user',
        modules: store.modules,
      });
      return profile;
    } catch (error) {
      await this.rollbackRegister({ uid, profileCreated });
      if (error instanceof AppException) {
        throw error;
      }
      throw mapFirebaseUserError(error, this.logger);
    }
  }

  async updateUser(uid: string, dto: UpdateUserDto): Promise<UserProfile> {
    const store = this.tenantContext.getStore();
    const current = await this.getManageableUser(uid);
    if (uid === store.userId && dto.status === 'inactive') {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'You cannot deactivate your own account');
    }

    const roleIds = dto.roleIds !== undefined ? await this.roles.assertRolesExist(dto.roleIds) : undefined;
    const patch: Partial<UserProfile> = {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
      ...(roleIds !== undefined ? { roleIds } : {}),
      ...(dto.branchIds !== undefined ? { branchIds: [...new Set(dto.branchIds)] } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedAt: new Date().toISOString(),
    };

    try {
      const authUpdate = {
        ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() } : {}),
        ...(dto.password ? { password: dto.password } : {}),
        ...(dto.status !== undefined ? { disabled: dto.status === 'inactive' } : {}),
      };
      if (Object.keys(authUpdate).length > 0) {
        await this.firebase.auth.updateUser(uid, authUpdate);
      }
      if (dto.status === 'inactive') {
        await this.firebase.auth.revokeRefreshTokens(uid);
      }
    } catch (error) {
      throw mapFirebaseUserError(error, this.logger);
    }

    await this.users.updateProfile(uid, patch);
    return {
      ...current,
      ...patch,
      displayName: patch.displayName ?? current.displayName ?? null,
      roleIds: patch.roleIds ?? current.roleIds ?? [],
      branchIds: patch.branchIds ?? current.branchIds ?? [],
    };
  }

  async deactivateUser(uid: string): Promise<void> {
    const store = this.tenantContext.getStore();
    if (uid === store.userId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'You cannot delete your own account');
    }
    await this.getManageableUser(uid);
    try {
      await this.firebase.auth.updateUser(uid, { disabled: true });
      await this.firebase.auth.revokeRefreshTokens(uid);
    } catch (error) {
      throw mapFirebaseUserError(error, this.logger);
    }
    await this.users.updateProfile(uid, { status: 'inactive', updatedAt: new Date().toISOString() });
  }

  private async getManageableUser(uid: string): Promise<UserProfile> {
    const profile = await this.users.findByUid(uid);
    if (!profile || profile.tenantId !== this.tenantContext.getTenantId()) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    if (profile.role === 'owner') {
      throw new AppException(ErrorCode.FORBIDDEN_ROLE, 'The owner account cannot be modified');
    }
    return profile;
  }

  private async rollbackRegister(state: {
    uid?: string;
    tenantId?: string;
    profileCreated: boolean;
  }): Promise<void> {
    if (state.profileCreated && state.uid) {
      try {
        await this.users.hardDelete(state.uid);
      } catch (error) {
        this.logger.error('Failed to rollback user profile', error as Error);
      }
    }
    if (state.tenantId) {
      try {
        await this.tenants.hardDelete(state.tenantId);
      } catch (error) {
        this.logger.error('Failed to rollback tenant', error as Error);
      }
    }
    if (state.uid) {
      try {
        await this.firebase.auth.deleteUser(state.uid);
      } catch (error) {
        this.logger.error('Failed to rollback Firebase Auth user', error as Error);
      }
    }
  }
}

function verificationUrl(module: ProductModule, token: string): string {
  if (module === 'drivingschool') {
    const url = process.env.APP_URL_DRIVINGSCHOOL?.trim() || (process.env.NODE_ENV === 'development' ? 'http://localhost:4200' : 'https://drivingschool.odivon.com');
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'rentacar') {
    const url = process.env.APP_URL_RENTACAR?.trim() || (process.env.NODE_ENV === 'development' ? 'http://localhost:4200' : 'https://rent.odivon.com');
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'gym') {
    const url = process.env.APP_URL_GYM?.trim() || process.env.APP_URL?.trim() || 'https://gym.odivon.com';
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'spa') {
    const url = process.env.APP_URL_SPA?.trim() || 'https://spa.odivon.com';
    return `${url.replace(/\/+$/, '')}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }
  if (module === 'vet') {
    const url = process.env.APP_URL_VET?.trim() || 'https://vet.odivon.com';
    return `${url.replace(/\/+$/, '')}/verify-email?token=${encodeURIComponent(token)}`;
  }
  const apiUrl = process.env.PUBLIC_API_URL?.trim() || 'https://mainapi.odivon.com';
  return `${apiUrl.replace(/\/+$/, '')}/api/v1/identity/verification?token=${encodeURIComponent(token)}`;
}

function mapFirebaseUserError(error: unknown, logger: Logger, fallback = 'User operation failed'): AppException {
  const firebase = describeFirebaseError(error);
  logger.error(`${fallback} code=${firebase.code} message=${firebase.message}`);
  if (firebase.code === 'auth/email-already-exists') {
    return new AppException(ErrorCode.VALIDATION_ERROR, 'Email is already registered');
  }
  if (firebase.code === 'auth/invalid-email') {
    return new AppException(ErrorCode.VALIDATION_ERROR, 'Email is invalid');
  }
  if (firebase.code === 'auth/invalid-password' || firebase.code === 'auth/weak-password') {
    return new AppException(ErrorCode.VALIDATION_ERROR, 'Password does not meet requirements');
  }
  if (firebase.code === 'auth/user-not-found') {
    return new AppException(ErrorCode.USER_NOT_FOUND, 'User not found');
  }
  if (isAuthConfigurationMissing(firebase)) {
    return new AppException(
      ErrorCode.VALIDATION_ERROR,
      'Firebase Authentication is not enabled. Open Authentication in the Firebase console, click Get started, then enable Email/Password.',
    );
  }
  return new AppException(
    ErrorCode.VALIDATION_ERROR,
    firebase.message ? `${fallback}: ${firebase.message}` : fallback,
  );
}

function describeFirebaseError(error: unknown): { code: string; message: string } {
  if (typeof error === 'object' && error !== null) {
    const record = error as {
      code?: unknown;
      message?: unknown;
      errorInfo?: { code?: unknown; message?: unknown };
    };
    const code = String(record.errorInfo?.code ?? record.code ?? '');
    const message = String(record.errorInfo?.message ?? record.message ?? '');
    return { code, message };
  }
  return { code: '', message: String(error) };
}

function isAuthConfigurationMissing(firebase: { code: string; message: string }): boolean {
  return (
    firebase.code === 'auth/configuration-not-found' ||
    firebase.message.includes('CONFIGURATION_NOT_FOUND') ||
    firebase.message.includes('no configuration corresponding to the provided identifier')
  );
}

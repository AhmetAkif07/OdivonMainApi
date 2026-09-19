import { Injectable, Logger } from '@nestjs/common';
import { AppException } from '../../shared/errors/app.exception';
import { ErrorCode } from '../../shared/errors/error-codes';
import { FirebaseService } from '../../shared/firebase/firebase.service';
import { TenantService } from '../tenant/tenant.service';
import { IdentityRepository } from './identity.repository';
import { RegisterDto } from './dto/register.dto';
import { UserProfile } from './entities/user-profile.entity';
import { TenantContext } from '../../shared/tenancy/tenant.context';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
    private readonly tenantContext: TenantContext,
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

      const createdTenant = await this.tenants.create({
        name: dto.tenantName,
        ownerUid: uid,
        modules: ['vet'],
      });
      tenantId = createdTenant.id;

      const now = new Date().toISOString();
      const profile: UserProfile = {
        uid,
        tenantId: createdTenant.id,
        role: 'owner',
        modules: ['vet'],
        email: dto.email,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await this.users.createProfile(profile);
      profileCreated = true;

      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId: createdTenant.id,
        role: 'owner',
        modules: ['vet'],
      });

      return {
        uid,
        email: dto.email,
        tenantId: createdTenant.id,
        role: 'owner' as const,
        modules: ['vet'] as const,
      };
    } catch (error) {
      await this.rollbackRegister({ uid, tenantId, profileCreated });
      if (error instanceof AppException) {
        throw error;
      }
      const firebase = describeFirebaseError(error);
      this.logger.error(`Register failed code=${firebase.code} message=${firebase.message}`);
      if (firebase.code === 'auth/email-already-exists') {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Email is already registered');
      }
      if (firebase.code === 'auth/invalid-email') {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Email is invalid');
      }
      if (firebase.code === 'auth/invalid-password' || firebase.code === 'auth/weak-password') {
        throw new AppException(ErrorCode.VALIDATION_ERROR, 'Password does not meet requirements');
      }
      if (isAuthConfigurationMissing(firebase)) {
        throw new AppException(
          ErrorCode.VALIDATION_ERROR,
          'Firebase Authentication is not enabled. Open Authentication in the Firebase console, click Get started, then enable Email/Password.',
        );
      }
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        firebase.message ? `Registration failed: ${firebase.message}` : 'Registration failed',
      );
    }
  }

  async me() {
    const store = this.tenantContext.getStore();
    const profile = await this.users.findByUid(store.userId);
    if (!profile) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User profile was not found');
    }
    const tenant = await this.tenants.getById(profile.tenantId);
    return {
      uid: profile.uid,
      email: profile.email,
      tenantId: profile.tenantId,
      role: profile.role,
      modules: profile.modules,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
      },
    };
  }

  async listUsers(): Promise<UserProfile[]> {
    return this.users.listByCurrentTenant();
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

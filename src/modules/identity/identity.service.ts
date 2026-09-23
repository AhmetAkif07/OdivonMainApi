import { Injectable, Logger } from '@nestjs/common';
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
  PERMISSION_RESOURCES,
} from '../../shared/authorization/permissions';
import { RolesService } from './roles/roles.service';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
    private readonly tenantContext: TenantContext,
    private readonly roles: RolesService,
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
      throw mapFirebaseUserError(error, this.logger, 'Registration failed');
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
      displayName: profile.displayName ?? null,
      tenantId: profile.tenantId,
      role: profile.role,
      modules: profile.modules,
      roleIds: profile.roleIds ?? [],
      permissions: profile.role === 'owner' ? fullPermissionMap() : (store.permissions ?? {}),
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
      },
    };
  }

  async listUsers(): Promise<UserProfile[]> {
    const users = await this.users.listByCurrentTenant();
    return users
      .map((user) => ({ ...user, displayName: user.displayName ?? null, roleIds: user.roleIds ?? [] }))
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
    return {
      actions: PERMISSION_ACTIONS,
      groups: Object.entries(PERMISSION_GROUP_LABELS).map(([key, label]) => ({ key, label })),
      resources: PERMISSION_RESOURCES,
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

import { Injectable, Logger } from '@nestjs/common';
import { UserRecord } from 'firebase-admin/auth';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { DeletePlatformUserDto, ListUsersQueryDto, UpdatePlatformUserDto } from './dto';

export type PlatformUserListItem = Omit<UserProfile, 'role'> & {
  role: UserProfile['role'] | null;
  /** The uid has a Firebase Auth account. */
  authExists: boolean;
  /** The uid has a Firestore users/{uid} profile. */
  hasProfile: boolean;
  lastSignInAt: string | null;
  /** Firestore profile flag (product APIs check this one); null when there is no profile. */
  profileEmailVerified: boolean | null;
};

@Injectable()
export class PlatformUsersService {
  private readonly logger = new Logger(PlatformUsersService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
  ) {}

  private usersCollection() {
    return this.firebase.db.collection(ROOT_COLLECTION.users);
  }

  /**
   * Firebase Auth is the source of truth for who exists: each account is joined with its
   * Firestore profile. Profiles whose Auth account was deleted are only shown with auth=missing|all.
   */
  async list(query: ListUsersQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const authFilter = query.auth ?? 'exists';

    const [profilesSnap, authUsers] = await Promise.all([
      this.usersCollection().get(),
      this.loadAuthUsers(),
    ]);
    const profiles = new Map(profilesSnap.docs.map((d) => [d.id, d.data() as UserProfile]));

    const all: PlatformUserListItem[] = [];
    profiles.forEach((profile, uid) => {
      const auth = authUsers.get(uid);
      // Never send the pending verification token to the panel
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { emailVerificationToken, ...safeProfile } = profile;
      all.push({
        ...safeProfile,
        uid,
        emailVerified: auth?.emailVerified ?? profile.emailVerified ?? false,
        profileEmailVerified: profile.emailVerified ?? null,
        authExists: Boolean(auth),
        hasProfile: true,
        lastSignInAt: auth?.metadata.lastSignInTime ? new Date(auth.metadata.lastSignInTime).toISOString() : null,
      });
    });
    authUsers.forEach((auth, uid) => {
      if (profiles.has(uid)) return;
      const claims = auth.customClaims ?? {};
      all.push({
        uid,
        tenantId: typeof claims['tenantId'] === 'string' ? claims['tenantId'] : '',
        role: (claims['role'] as UserProfile['role']) ?? null,
        modules: Array.isArray(claims['modules']) ? (claims['modules'] as UserProfile['modules']) : [],
        email: auth.email ?? '',
        displayName: auth.displayName ?? null,
        phone: auth.phoneNumber ?? null,
        emailVerified: auth.emailVerified,
        profileEmailVerified: null,
        status: auth.disabled ? 'inactive' : 'active',
        createdAt: new Date(auth.metadata.creationTime).toISOString(),
        updatedAt: new Date(auth.metadata.creationTime).toISOString(),
        authExists: true,
        hasProfile: false,
        lastSignInAt: auth.metadata.lastSignInTime ? new Date(auth.metadata.lastSignInTime).toISOString() : null,
      });
    });

    const authCount = authUsers.size;
    const staleProfileCount = all.filter((u) => !u.authExists).length;

    let items = all.filter((u) =>
      authFilter === 'all' ? true : authFilter === 'missing' ? !u.authExists : u.authExists,
    );
    if (query.tenantId) {
      items = items.filter((u) => u.tenantId === query.tenantId);
    }
    if (query.status) {
      items = items.filter((u) => u.status === query.status);
    }
    if (query.emailVerified === 'true' || query.emailVerified === 'false') {
      const wanted = query.emailVerified === 'true';
      items = items.filter((u) => (Boolean(u.emailVerified) && u.profileEmailVerified !== false) === wanted);
    }
    if (query.q && query.q.trim()) {
      const needle = query.q.trim().toLowerCase();
      items = items.filter(
        (u) =>
          u.email?.toLowerCase().includes(needle) ||
          u.displayName?.toLowerCase().includes(needle) ||
          u.phone?.includes(needle) ||
          u.uid.toLowerCase().includes(needle),
      );
    }

    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const total = items.length;
    const offset = (page - 1) * pageSize;
    const paged = items.slice(offset, offset + pageSize);

    return {
      items: paged,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      authCount,
      staleProfileCount,
    };
  }

  /** Deletes every users/{uid} profile whose Firebase Auth account no longer exists. */
  async cleanupStaleProfiles(dto: DeletePlatformUserDto, admin: PlatformAdminUser) {
    const [profilesSnap, authUsers] = await Promise.all([
      this.usersCollection().get(),
      this.loadAuthUsers(),
    ]);
    const stale = profilesSnap.docs.filter((d) => !authUsers.has(d.id));
    const reason = dto.reason?.trim() || null;

    for (let i = 0; i < stale.length; i += 400) {
      const batch = this.firebase.db.batch();
      stale.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }

    for (const doc of stale) {
      const profile = doc.data() as UserProfile;
      await this.audit.record({
        adminUid: admin.uid,
        adminEmail: admin.email,
        action: 'USER_STALE_PROFILE_DELETED',
        targetType: 'user',
        tenantId: profile.tenantId,
        targetId: doc.id,
        before: {
          email: profile.email,
          displayName: profile.displayName ?? null,
          role: profile.role,
          tenantId: profile.tenantId,
        },
        after: null,
        reason,
      });
    }

    return { deleted: stale.length };
  }

  private async loadAuthUsers() {
    const users = new Map<string, UserRecord>();
    let pageToken: string | undefined;
    do {
      const res = await this.firebase.auth.listUsers(1000, pageToken);
      res.users.forEach((u) => users.set(u.uid, u));
      pageToken = res.pageToken;
    } while (pageToken);
    return users;
  }

  async getByUid(uid: string) {
    const doc = await this.usersCollection().doc(uid).get();
    if (!doc.exists) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    return doc.data() as UserProfile;
  }

  async updateUser(uid: string, dto: UpdatePlatformUserDto, admin: PlatformAdminUser) {
    const userDoc = await this.usersCollection().doc(uid).get();
    if (!userDoc.exists) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    const current = userDoc.data() as UserProfile;
    const nowIso = new Date().toISOString();

    const patch: Partial<UserProfile> = {
      ...(dto.displayName !== undefined ? { displayName: dto.displayName.trim() || null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      updatedAt: nowIso,
    };

    if (dto.status === 'inactive') {
      patch.suspendedByPlatform = false; // direct user deactivation
      try {
        await this.firebase.auth.updateUser(uid, { disabled: true });
        await this.firebase.auth.revokeRefreshTokens(uid);
      } catch (err) {
        this.logger.warn(`Could not disable Firebase Auth for user ${uid}: ${(err as Error).message}`);
      }
    } else if (dto.status === 'active') {
      try {
        await this.firebase.auth.updateUser(uid, { disabled: false });
      } catch (err) {
        this.logger.warn(`Could not enable Firebase Auth for user ${uid}: ${(err as Error).message}`);
      }
    }

    if (dto.displayName !== undefined && dto.displayName.trim()) {
      try {
        await this.firebase.auth.updateUser(uid, { displayName: dto.displayName.trim() });
      } catch {
        // ignore
      }
    }

    await userDoc.ref.update(patch);

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'USER_UPDATED',
      targetType: 'user',
      tenantId: current.tenantId,
      targetId: uid,
      before: { displayName: current.displayName, status: current.status },
      after: patch,
    });

    return { success: true };
  }

  async deleteUser(uid: string, dto: DeletePlatformUserDto, admin: PlatformAdminUser) {
    if (uid === admin.uid) {
      throw new AppException(ErrorCode.PLATFORM_FORBIDDEN, 'Kendi hesabınızı silemezsiniz');
    }

    const userDoc = await this.usersCollection().doc(uid).get();
    let user = userDoc.data() as UserProfile | undefined;
    if (!user) {
      // Auth account without a Firestore profile
      const authUser = await this.firebase.auth.getUser(uid).catch(() => null);
      if (!authUser) {
        throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found');
      }
      user = {
        uid,
        tenantId: (authUser.customClaims?.['tenantId'] as string) ?? '',
        role: (authUser.customClaims?.['role'] as UserProfile['role']) ?? 'user',
        modules: [],
        email: authUser.email ?? '',
        displayName: authUser.displayName ?? null,
        status: authUser.disabled ? 'inactive' : 'active',
        createdAt: authUser.metadata.creationTime,
        updatedAt: authUser.metadata.creationTime,
      };
    }

    const adminDoc = await this.firebase.db.collection(ROOT_COLLECTION.platformAdmins).doc(uid).get();
    if (adminDoc.exists) {
      throw new AppException(ErrorCode.PLATFORM_FORBIDDEN, 'Platform yöneticisi panelden silinemez');
    }

    // Deleting the owner would leave the tenant without an owner account
    if (user.tenantId) {
      const tenantDoc = await this.firebase.db.collection(ROOT_COLLECTION.tenants).doc(user.tenantId).get();
      if (user.role === 'owner' || tenantDoc.data()?.ownerUid === uid) {
        throw new AppException(
          ErrorCode.PLATFORM_FORBIDDEN,
          'İşletme sahibi silinemez. İşletmeyi askıya alın veya sahipliği başka kullanıcıya devredin.',
        );
      }
    }

    try {
      await this.firebase.auth.deleteUser(uid);
    } catch (err) {
      if ((err as { code?: string }).code !== 'auth/user-not-found') {
        throw new AppException(ErrorCode.VALIDATION_ERROR, `Firebase Auth delete failed: ${(err as Error).message}`);
      }
      this.logger.warn(`Firebase Auth user ${uid} was already missing, deleting profile only`);
    }

    if (userDoc.exists) {
      await userDoc.ref.delete();
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'USER_DELETED',
      targetType: 'user',
      tenantId: user.tenantId,
      targetId: uid,
      before: {
        email: user.email,
        displayName: user.displayName ?? null,
        role: user.role,
        modules: user.modules,
        status: user.status,
      },
      after: null,
      reason: dto.reason?.trim() || null,
    });

    return { success: true, uid };
  }

  async generatePasswordResetLink(uid: string, admin: PlatformAdminUser) {
    const user = await this.getByUid(uid);
    let link = '';
    try {
      link = await this.firebase.auth.generatePasswordResetLink(user.email);
    } catch (err) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Password reset link failed: ${(err as Error).message}`);
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'PASSWORD_RESET_LINK_GENERATED',
      targetType: 'user',
      tenantId: user.tenantId,
      targetId: uid,
      after: { email: user.email },
    });

    return { link, email: user.email };
  }

  async revokeSessions(uid: string, admin: PlatformAdminUser) {
    const user = await this.getByUid(uid);
    try {
      await this.firebase.auth.revokeRefreshTokens(uid);
    } catch (err) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Revoke sessions failed: ${(err as Error).message}`);
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'USER_SESSIONS_REVOKED',
      targetType: 'user',
      tenantId: user.tenantId,
      targetId: uid,
    });

    return { success: true };
  }
}

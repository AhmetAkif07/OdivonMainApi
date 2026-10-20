import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { DeletePlatformUserDto, ListUsersQueryDto, UpdatePlatformUserDto } from './dto';

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

  async list(query: ListUsersQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    let q: FirebaseFirestore.Query = this.usersCollection();

    if (query.tenantId) {
      q = q.where('tenantId', '==', query.tenantId);
    }
    if (query.status) {
      q = q.where('status', '==', query.status);
    }

    const snapshot = await q.get();
    let items = snapshot.docs.map((d) => d.data() as UserProfile);

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
    };
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
    if (!userDoc.exists) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'User not found');
    }
    const user = userDoc.data() as UserProfile;

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

    await userDoc.ref.delete();

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

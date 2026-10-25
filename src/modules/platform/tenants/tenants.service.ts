import * as crypto from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { UserRecord } from 'firebase-admin/auth';
import { MailService } from '../../../shared/mail/mail.service';
import { verificationUrl } from '../../../shared/mail/verification-url';
import { ProductModule } from '../../../shared/authorization/constants';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { parseModuleFilter } from '../shared/module-filter';
import { calculateExtendedDate, computeTenantStatus } from '../shared/subscription-math';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import {
  ExtendTenantDurationDto,
  ListTenantsQueryDto,
  SetTenantExpiryDto,
  SuspendTenantDto,
  UpdateTenantDto,
} from './dto';

/** A tenant user as the panel sees it: Firebase Auth account joined with its Firestore profile. */
export type PlatformTenantUser = {
  uid: string;
  tenantId: string;
  role: UserProfile['role'] | null;
  modules: UserProfile['modules'];
  email: string;
  displayName: string | null;
  phone: string | null;
  status: UserProfile['status'];
  suspendedByPlatform?: boolean;
  membershipStatus?: UserProfile['membershipStatus'];
  createdAt: string;
  updatedAt: string;
  authExists: boolean;
  hasProfile: boolean;
  emailVerified: boolean;
  /** Firestore profile flag; the product APIs' EmailVerifiedGuard reads this one. */
  profileEmailVerified: boolean | null;
  emailVerifiedAt: string | null;
  emailVerifiedBy: 'link' | 'platform' | null;
  /** Expiry of the last verification link that was sent (null when none is pending). */
  emailVerificationExpiresAt: string | null;
  authDisabled: boolean;
  providers: string[];
  lastSignInAt: string | null;
  isOwner: boolean;
  /** Earliest-created account of the tenant (the one who signed up first). */
  isFirstRegistered: boolean;
};

@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
    private readonly mail: MailService,
  ) {}

  private tenantsCollection() {
    return this.firebase.db.collection(ROOT_COLLECTION.tenants);
  }

  private usersCollection() {
    return this.firebase.db.collection(ROOT_COLLECTION.users);
  }

  async list(query: ListTenantsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const allowedModules = parseModuleFilter(query.module);

    const snapshot = await this.tenantsCollection().get();
    const now = new Date();

    let items = snapshot.docs
      .map((d) => d.data() as TenantDocument)
      .filter((t) => !t.deletedAt);

    // Module filter
    items = items.filter((t) =>
      t.modules?.some((m) => allowedModules.includes(m)),
    );

    // Status filter (active | inactive)
    if (query.status) {
      items = items.filter((t) => t.status === query.status);
    }

    // Demo filter
    if (query.isDemo !== undefined && query.isDemo !== '') {
      const isDemoBool = query.isDemo === 'true';
      items = items.filter((t) => Boolean(t.isDemo) === isDemoBool);
    }

    // Membership filter (trial, active, expired)
    if (query.membership) {
      items = items.filter((t) => {
        const state = computeTenantStatus(t, now);
        return state.computedStatus === query.membership || t.membershipStatus === query.membership;
      });
    }

    // Owner e-mail verification filter (needs every owner's Auth record, so load them all)
    let authUsers: Map<string, UserRecord> | null = null;
    if (query.emailVerified === 'true' || query.emailVerified === 'false') {
      authUsers = await this.loadAuthUsers();
      const wanted = query.emailVerified === 'true';
      items = items.filter((t) => Boolean(t.ownerUid && authUsers!.get(t.ownerUid)?.emailVerified) === wanted);
    }

    // Text search (name or ID)
    if (query.q && query.q.trim()) {
      const needle = query.q.trim().toLowerCase();
      items = items.filter(
        (t) =>
          t.name?.toLowerCase().includes(needle) ||
          t.id.toLowerCase().includes(needle) ||
          t.ownerUid?.toLowerCase().includes(needle),
      );
    }

    // Sort by createdAt desc
    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const total = items.length;
    const offset = (page - 1) * pageSize;
    const paged = items.slice(offset, offset + pageSize);

    // Owner Auth records for the visible page (getUsers takes at most 100 uids; pageSize <= 100)
    if (!authUsers) {
      const ownerUids = [...new Set(paged.map((t) => t.ownerUid).filter((uid): uid is string => Boolean(uid)))];
      authUsers = new Map();
      if (ownerUids.length) {
        try {
          const res = await this.firebase.auth.getUsers(ownerUids.map((uid) => ({ uid })));
          res.users.forEach((u) => authUsers!.set(u.uid, u));
        } catch (err) {
          this.logger.warn(`Owner Auth records could not be loaded: ${(err as Error).message}`);
        }
      }
    }

    // Attach computed state
    const enriched = paged.map((t) => {
      const effective = computeTenantStatus(t, now);
      const ownerAuth = t.ownerUid ? authUsers!.get(t.ownerUid) : undefined;
      return {
        ...t,
        ...effective,
        ownerEmail: ownerAuth?.email ?? null,
        ownerEmailVerified: ownerAuth ? ownerAuth.emailVerified : null,
      };
    });

    return {
      items: enriched,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(id: string) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }

    const tenant = tenantDoc.data() as TenantDocument;
    const now = new Date();
    const effective = computeTenantStatus(tenant, now);

    // Tenant users (Firebase Auth joined with Firestore profiles), owner and first sign-up
    const users = await this.loadTenantUsers(id, tenant.ownerUid);
    const owner = users.find((u) => u.isOwner) ?? null;
    const firstUser = users.find((u) => u.isFirstRegistered) ?? null;
    const userCount = users.filter((u) => u.authExists).length;

    // Check if farm subscription exists
    let farmSubscription: Record<string, unknown> | null = null;
    if (tenant.modules?.includes('farm')) {
      const farmSnap = await this.firebase.db
        .collection(tenantCollectionPath(id, TENANT_COLLECTION.farmSubscription))
        .doc(id)
        .get();
      if (farmSnap.exists) {
        farmSubscription = farmSnap.data() as Record<string, unknown>;
      }
    }

    // Recent saas payments for this tenant
    const paymentsSnap = await this.firebase.db
      .collection(`tenants/${id}/saasPayments`)
      .limit(10)
      .get();
    const recentPayments = paymentsSnap.docs
      .map((d) => d.data())
      .sort((a, b) => String(b['paidAt'] || '').localeCompare(String(a['paidAt'] || '')));

    // Recent audit logs
    const recentAuditLogs = await this.audit.listByTenant(id, 10);

    return {
      tenant: {
        ...tenant,
        ...effective,
      },
      owner,
      firstUser,
      userCount,
      farmSubscription,
      recentPayments,
      recentAuditLogs,
    };
  }

  async update(id: string, dto: UpdateTenantDto, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const current = tenantDoc.data() as TenantDocument;

    const patch: Partial<TenantDocument> = {
      ...(dto.name ? { name: dto.name.trim() } : {}),
      ...(dto.modules ? { modules: dto.modules } : {}),
      updatedAt: new Date().toISOString(),
    };

    await this.tenantsCollection().doc(id).update(patch);

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'TENANT_UPDATED',
      targetType: 'tenant',
      tenantId: id,
      targetId: id,
      before: { name: current.name, modules: current.modules },
      after: patch,
    });

    return { success: true };
  }

  async extendDuration(id: string, dto: ExtendTenantDurationDto, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    const now = new Date();
    const nowIso = now.toISOString();

    const isTrial = dto.target === 'trial';
    const currentEnd = isTrial ? tenant.trialEndsAt : tenant.subscriptionEndsAt;
    const newEnd = calculateExtendedDate(currentEnd, dto.days, now);

    const patch: Partial<TenantDocument> = isTrial
      ? {
          membershipStatus: 'trial',
          trialEndsAt: newEnd,
          updatedAt: nowIso,
        }
      : {
          membershipStatus: 'active',
          subscriptionEndsAt: newEnd,
          updatedAt: nowIso,
        };

    const batch = this.firebase.db.batch();
    batch.update(tenantDoc.ref, patch);

    // Sync farmSubscription if farm module is active
    if (tenant.modules?.includes('farm')) {
      const farmSubRef = this.firebase.db.doc(`tenants/${id}/${TENANT_COLLECTION.farmSubscription}/${id}`);
      const farmSubSnap = await farmSubRef.get();
      if (farmSubSnap.exists) {
        batch.update(farmSubRef, isTrial ? { trialEndsAt: newEnd, currentPeriodEnd: newEnd } : { currentPeriodEnd: newEnd, status: 'active' });
      }
    }

    await batch.commit();

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: isTrial ? 'TRIAL_EXTENDED' : 'SUBSCRIPTION_EXTENDED',
      targetType: 'tenant',
      tenantId: id,
      targetId: id,
      before: { [isTrial ? 'trialEndsAt' : 'subscriptionEndsAt']: currentEnd },
      after: { [isTrial ? 'trialEndsAt' : 'subscriptionEndsAt']: newEnd, daysAdded: dto.days },
      reason: dto.reason,
    });

    return {
      success: true,
      target: dto.target,
      previousEndsAt: currentEnd,
      newEndsAt: newEnd,
    };
  }

  async setExpiry(id: string, dto: SetTenantExpiryDto, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    const isTrial = dto.target === 'trial';
    const nowIso = new Date().toISOString();

    const patch: Partial<TenantDocument> = isTrial
      ? {
          membershipStatus: 'trial',
          trialEndsAt: dto.endsAt,
          updatedAt: nowIso,
        }
      : {
          membershipStatus: 'active',
          subscriptionEndsAt: dto.endsAt,
          updatedAt: nowIso,
        };

    const batch = this.firebase.db.batch();
    batch.update(tenantDoc.ref, patch);

    if (tenant.modules?.includes('farm')) {
      const farmSubRef = this.firebase.db.doc(`tenants/${id}/${TENANT_COLLECTION.farmSubscription}/${id}`);
      const farmSubSnap = await farmSubRef.get();
      if (farmSubSnap.exists) {
        batch.update(farmSubRef, isTrial ? { trialEndsAt: dto.endsAt, currentPeriodEnd: dto.endsAt } : { currentPeriodEnd: dto.endsAt });
      }
    }

    await batch.commit();

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: isTrial ? 'TRIAL_EXPIRY_SET' : 'SUBSCRIPTION_EXPIRY_SET',
      targetType: 'tenant',
      tenantId: id,
      targetId: id,
      before: { [isTrial ? 'trialEndsAt' : 'subscriptionEndsAt']: isTrial ? tenant.trialEndsAt : tenant.subscriptionEndsAt },
      after: { [isTrial ? 'trialEndsAt' : 'subscriptionEndsAt']: dto.endsAt },
      reason: dto.reason,
    });

    return { success: true, endsAt: dto.endsAt };
  }

  async expireImmediately(id: string, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    const patch: Partial<TenantDocument> = {
      membershipStatus: 'expired',
      trialEndsAt: yesterday,
      subscriptionEndsAt: yesterday,
      updatedAt: nowIso,
    };

    const batch = this.firebase.db.batch();
    batch.update(tenantDoc.ref, patch);

    if (tenant.modules?.includes('farm')) {
      const farmSubRef = this.firebase.db.doc(`tenants/${id}/${TENANT_COLLECTION.farmSubscription}/${id}`);
      const farmSubSnap = await farmSubRef.get();
      if (farmSubSnap.exists) {
        batch.update(farmSubRef, { status: 'expired', currentPeriodEnd: yesterday, trialEndsAt: yesterday });
      }
    }

    await batch.commit();

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'TENANT_EXPIRED_IMMEDIATELY',
      targetType: 'tenant',
      tenantId: id,
      targetId: id,
      before: { membershipStatus: tenant.membershipStatus },
      after: { membershipStatus: 'expired', endsAt: yesterday },
    });

    return { success: true, membershipStatus: 'expired' };
  }

  async suspend(id: string, dto: SuspendTenantDto, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const nowIso = new Date().toISOString();

    // 1. Suspend tenant
    await tenantDoc.ref.update({
      status: 'inactive',
      suspendedAt: nowIso,
      suspendedReason: dto.reason ?? null,
      updatedAt: nowIso,
    });

    // 2. Find all active users of this tenant and deactivate them with suspendedByPlatform marker
    const usersSnap = await this.usersCollection()
      .where('tenantId', '==', id)
      .where('status', '==', 'active')
      .get();

    const affectedUserUids: string[] = [];
    for (const uDoc of usersSnap.docs) {
      const uid = uDoc.id;
      affectedUserUids.push(uid);

      await uDoc.ref.update({
        status: 'inactive',
        suspendedByPlatform: true,
        updatedAt: nowIso,
      });

      // Disable in Firebase Auth and revoke tokens
      try {
        await this.firebase.auth.updateUser(uid, { disabled: true });
        await this.firebase.auth.revokeRefreshTokens(uid);
      } catch (authErr) {
        this.logger.warn(`Could not disable Firebase Auth for user ${uid}: ${(authErr as Error).message}`);
      }
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'TENANT_SUSPENDED',
      targetType: 'tenant',
      tenantId: id,
      targetId: id,
      reason: dto.reason,
      after: { suspendedUsersCount: affectedUserUids.length },
    });

    return {
      success: true,
      suspendedUsersCount: affectedUserUids.length,
    };
  }

  async reactivate(id: string, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const nowIso = new Date().toISOString();

    // 1. Reactivate tenant
    await tenantDoc.ref.update({
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
      updatedAt: nowIso,
    });

    // 2. Reactivate ONLY users that were suspended by platform
    const usersSnap = await this.usersCollection()
      .where('tenantId', '==', id)
      .where('suspendedByPlatform', '==', true)
      .get();

    const reactivatedUserUids: string[] = [];
    for (const uDoc of usersSnap.docs) {
      const uid = uDoc.id;
      reactivatedUserUids.push(uid);

      await uDoc.ref.update({
        status: 'active',
        suspendedByPlatform: false,
        updatedAt: nowIso,
      });

      try {
        await this.firebase.auth.updateUser(uid, { disabled: false });
      } catch (authErr) {
        this.logger.warn(`Could not enable Firebase Auth for user ${uid}: ${(authErr as Error).message}`);
      }
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'TENANT_REACTIVATED',
      targetType: 'tenant',
      tenantId: id,
      targetId: id,
      after: { reactivatedUsersCount: reactivatedUserUids.length },
    });

    return {
      success: true,
      reactivatedUsersCount: reactivatedUserUids.length,
    };
  }

  async listTenantUsers(tenantId: string) {
    const tenantDoc = await this.tenantsCollection().doc(tenantId).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    return this.loadTenantUsers(tenantId, tenant.ownerUid);
  }

  /**
   * Firebase Auth is the source of truth: a uid belongs to the tenant when its Firestore profile,
   * its Auth tenantId claim or the tenant's ownerUid says so. Owner first, then newest first.
   */
  private async loadTenantUsers(tenantId: string, ownerUid?: string | null): Promise<PlatformTenantUser[]> {
    const [profilesSnap, authUsers] = await Promise.all([
      this.usersCollection().where('tenantId', '==', tenantId).get(),
      this.loadAuthUsers(),
    ]);
    const profiles = new Map(profilesSnap.docs.map((d) => [d.id, d.data() as UserProfile]));

    const uids = new Set<string>(profiles.keys());
    authUsers.forEach((auth, uid) => {
      if (auth.customClaims?.['tenantId'] === tenantId) uids.add(uid);
    });
    if (ownerUid) uids.add(ownerUid);

    const toIso = (value?: string) => (value ? new Date(value).toISOString() : null);
    const users: PlatformTenantUser[] = [];
    for (const uid of uids) {
      const profile = profiles.get(uid);
      const auth = authUsers.get(uid);
      if (!profile && !auth) continue; // owner uid with neither an account nor a profile
      const claims = auth?.customClaims ?? {};
      const authCreatedAt = toIso(auth?.metadata.creationTime);
      users.push({
        uid,
        tenantId,
        role: profile?.role ?? (claims['role'] as UserProfile['role']) ?? null,
        modules: profile?.modules ?? (Array.isArray(claims['modules']) ? (claims['modules'] as UserProfile['modules']) : []),
        email: profile?.email || auth?.email || '',
        displayName: profile?.displayName ?? auth?.displayName ?? null,
        phone: profile?.phone ?? auth?.phoneNumber ?? null,
        status: profile?.status ?? (auth?.disabled ? 'inactive' : 'active'),
        suspendedByPlatform: profile?.suspendedByPlatform,
        membershipStatus: profile?.membershipStatus,
        createdAt: authCreatedAt ?? profile?.createdAt ?? '',
        updatedAt: profile?.updatedAt ?? authCreatedAt ?? '',
        authExists: Boolean(auth),
        hasProfile: Boolean(profile),
        emailVerified: auth?.emailVerified ?? profile?.emailVerified ?? false,
        profileEmailVerified: profile ? profile.emailVerified ?? null : null,
        emailVerifiedAt: profile?.emailVerifiedAt ?? null,
        emailVerifiedBy: profile?.emailVerifiedBy ?? null,
        emailVerificationExpiresAt: profile?.emailVerificationExpiresAt ?? null,
        authDisabled: auth?.disabled ?? false,
        providers: auth?.providerData.map((p) => p.providerId) ?? [],
        lastSignInAt: toIso(auth?.metadata.lastSignInTime),
        isOwner: Boolean(ownerUid) && uid === ownerUid,
        isFirstRegistered: false,
      });
    }

    const firstRegistered = users
      .filter((u) => u.authExists && u.createdAt)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (firstRegistered) firstRegistered.isFirstRegistered = true;

    return users.sort(
      (a, b) => Number(b.isOwner) - Number(a.isOwner) || (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
  }

  /** Marks the user's e-mail as verified in Firebase Auth and in the Firestore profile. */
  async markUserEmailVerified(tenantId: string, uid: string, admin: PlatformAdminUser) {
    const { auth, profile } = await this.findTenantMember(tenantId, uid);
    if (!auth) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Bu kullanıcının Firebase Auth hesabı yok, e-postası doğrulanamaz.',
      );
    }
    const alreadyVerified = auth.emailVerified && (!profile || profile.emailVerified === true);
    const nowIso = new Date().toISOString();

    if (!auth.emailVerified) {
      await this.firebase.auth.updateUser(uid, { emailVerified: true });
    }
    if (profile && profile.emailVerified !== true) {
      await this.usersCollection().doc(uid).update({
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiresAt: null,
        emailVerifiedAt: nowIso,
        emailVerifiedBy: 'platform',
        updatedAt: nowIso,
      });
    }

    if (!alreadyVerified) {
      await this.audit.record({
        adminUid: admin.uid,
        adminEmail: admin.email,
        action: 'USER_EMAIL_VERIFIED',
        targetType: 'user',
        tenantId,
        targetId: uid,
        before: { authEmailVerified: auth.emailVerified, profileEmailVerified: profile?.emailVerified ?? null },
        after: { emailVerified: true, email: auth.email ?? profile?.email ?? null },
      });
    }

    return { success: true, alreadyVerified, emailVerifiedAt: alreadyVerified ? (profile?.emailVerifiedAt ?? null) : nowIso };
  }

  /** Sends a fresh verification link (24h) to an unverified user, same as the app's "resend" flow. */
  async resendUserVerification(tenantId: string, uid: string, admin: PlatformAdminUser) {
    const { auth, profile, tenant } = await this.findTenantMember(tenantId, uid);
    if (!auth) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu kullanıcının Firebase Auth hesabı yok.');
    }
    if (!profile) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Kullanıcının profili yok; doğrulama bağlantısı gönderilemez. E-postayı elle doğrulayabilirsiniz.',
      );
    }
    if (auth.emailVerified && profile.emailVerified === true) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Bu kullanıcının e-postası zaten doğrulanmış.');
    }
    const email = profile.email || auth.email;
    if (!email) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Kullanıcının e-posta adresi yok.');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await this.usersCollection().doc(uid).update({
      emailVerificationToken: token,
      emailVerificationExpiresAt: expiresAt,
      updatedAt: new Date().toISOString(),
    });

    const productModule: ProductModule = profile.modules?.[0] ?? tenant.modules?.[0] ?? 'vet';
    let sent = false;
    try {
      sent = await this.mail.sendVerificationEmail({
        to: email,
        displayName: profile.displayName ?? auth.displayName ?? null,
        tenantName: tenant.name || 'İşletme',
        verificationLink: verificationUrl(productModule, token),
        module: productModule,
      });
    } catch (err) {
      this.logger.error(`Doğrulama maili gönderilemedi (${email}): ${(err as Error).message}`);
    }
    if (!sent) {
      throw new AppException(
        ErrorCode.VALIDATION_ERROR,
        'Doğrulama e-postası gönderilemedi. Mail ayarlarını kontrol edip tekrar deneyin.',
      );
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'USER_VERIFICATION_EMAIL_SENT',
      targetType: 'user',
      tenantId,
      targetId: uid,
      after: { email, module: productModule, expiresAt },
    });

    return { success: true, email, expiresAt };
  }

  /** Tenant of a user, from the Firestore profile or the Auth tenantId claim. */
  async resolveUserTenantId(uid: string): Promise<string> {
    const [profileSnap, auth] = await Promise.all([
      this.usersCollection().doc(uid).get(),
      this.firebase.auth.getUser(uid).catch(() => null),
    ]);
    const profile = profileSnap.exists ? (profileSnap.data() as UserProfile) : null;
    const claimTenant = auth?.customClaims?.['tenantId'];
    const tenantId = profile?.tenantId || (typeof claimTenant === 'string' ? claimTenant : '');
    if (!profile && !auth) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'Kullanıcı bulunamadı.');
    }
    if (!tenantId) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Kullanıcı bir işletmeye bağlı değil.');
    }
    return tenantId;
  }

  /** Loads one user of the tenant without listing every Auth account. */
  private async findTenantMember(tenantId: string, uid: string) {
    const tenantDoc = await this.tenantsCollection().doc(tenantId).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    const [profileSnap, auth] = await Promise.all([
      this.usersCollection().doc(uid).get(),
      this.firebase.auth.getUser(uid).catch(() => null),
    ]);
    const profile = profileSnap.exists ? (profileSnap.data() as UserProfile) : null;
    const belongs =
      profile?.tenantId === tenantId ||
      auth?.customClaims?.['tenantId'] === tenantId ||
      tenant.ownerUid === uid;
    if (!belongs || (!profile && !auth)) {
      throw new AppException(ErrorCode.USER_NOT_FOUND, 'Kullanıcı bu işletmede bulunamadı.');
    }
    return { tenant, profile, auth };
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
}

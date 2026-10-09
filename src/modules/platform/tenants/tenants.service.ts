import { Injectable, Logger } from '@nestjs/common';
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

@Injectable()
export class PlatformTenantsService {
  private readonly logger = new Logger(PlatformTenantsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
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

    // Attach computed state
    const enriched = paged.map((t) => {
      const effective = computeTenantStatus(t, now);
      return {
        ...t,
        ...effective,
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

    // Fetch owner info
    let ownerProfile: UserProfile | null = null;
    if (tenant.ownerUid) {
      const ownerSnap = await this.usersCollection().doc(tenant.ownerUid).get();
      if (ownerSnap.exists) {
        ownerProfile = ownerSnap.data() as UserProfile;
      }
    }

    // User count for tenant
    const usersCountSnap = await this.usersCollection()
      .where('tenantId', '==', id)
      .count()
      .get();
    const userCount = usersCountSnap.data().count;

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
      owner: ownerProfile,
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
    const snapshot = await this.usersCollection().where('tenantId', '==', tenantId).get();
    return snapshot.docs
      .map((d) => d.data() as UserProfile)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }
}

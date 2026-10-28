import { randomBytes } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { UserProfile } from '../../identity/entities/user-profile.entity';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { PlatformTenantsService } from '../tenants/tenants.service';
import { PlatformRevenueService } from '../revenue/revenue.service';
import { DEMO_DEFAULT_DAYS, DEMO_SUSPEND_AFTER_DAYS } from './demo-policy';
import { seedDemoDataForModule } from './demo-seeds';
import { ConvertDemoDto, CreateDemoTenantDto, ResetDemoDto } from './dto';
import { addDaysToDate, computeTenantStatus, daysDifference } from '../shared/subscription-math';

@Injectable()
export class PlatformDemosService {
  private readonly logger = new Logger(PlatformDemosService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
    private readonly tenantsService: PlatformTenantsService,
    private readonly revenueService: PlatformRevenueService,
  ) {}

  private tenantsCollection() {
    return this.firebase.db.collection(ROOT_COLLECTION.tenants);
  }

  private usersCollection() {
    return this.firebase.db.collection(ROOT_COLLECTION.users);
  }

  async listDemos() {
    const snapshot = await this.tenantsCollection()
      .where('isDemo', '==', true)
      .get();

    const now = new Date();
    // Older demo docs can miss fields or hold Firestore Timestamps instead of
    // ISO strings; normalise them so one bad doc can't break the whole list.
    const items = snapshot.docs
      .map((d) => {
        const raw = d.data() as Record<string, unknown>;
        return {
          ...raw,
          id: (raw.id as string) || d.id,
          name: (raw.name as string) || d.id,
          modules: Array.isArray(raw.modules) ? raw.modules : [],
          createdAt: toIsoOrNull(raw.createdAt),
          updatedAt: toIsoOrNull(raw.updatedAt),
          trialEndsAt: toIsoOrNull(raw.trialEndsAt),
          subscriptionEndsAt: toIsoOrNull(raw.subscriptionEndsAt),
          deletedAt: raw.deletedAt ?? null,
        } as unknown as TenantDocument;
      })
      .filter((t) => !t.deletedAt);

    items.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return items.map((t) => {
      const state = computeTenantStatus(t, now);
      // Days left until the 7-day auto suspension, once the trial has ended
      let daysUntilSuspension: number | null = null;
      const trialEndMs = Date.parse(t.trialEndsAt ?? '');
      if (Number.isFinite(trialEndMs) && state.computedStatus === 'expired') {
        const suspendDeadline = addDaysToDate(new Date(trialEndMs), DEMO_SUSPEND_AFTER_DAYS);
        daysUntilSuspension = Math.max(0, daysDifference(suspendDeadline.toISOString(), now) || 0);
      }

      return {
        ...t,
        ...state,
        daysUntilSuspension,
      };
    });
  }

  async createDemo(dto: CreateDemoTenantDto, admin: PlatformAdminUser) {
    const now = new Date();
    const nowIso = now.toISOString();
    const days = dto.days && dto.days > 0 ? dto.days : DEMO_DEFAULT_DAYS;
    const trialEndsAt = addDaysToDate(now, days).toISOString();

    const plainPassword = dto.password?.trim() || randomBytes(6).toString('hex'); // 12 chars
    const email = dto.ownerEmail.trim().toLowerCase();

    let uid: string | undefined;
    let tenantId: string | undefined;

    try {
      // 1. Create Firebase Auth user
      const userRecord = await this.firebase.auth.createUser({
        email,
        password: plainPassword,
        displayName: dto.displayName?.trim() || dto.tenantName,
      });
      uid = userRecord.uid;

      // 2. Create Tenant Document
      const tenantRef = this.tenantsCollection().doc();
      tenantId = tenantRef.id;

      const tenantDoc: TenantDocument = {
        ...createBaseFields(tenantId, uid, nowIso),
        name: dto.tenantName.trim(),
        ownerUid: uid,
        modules: [dto.module],
        status: 'active',
        onboardingCompleted: true,
        membershipStatus: 'trial',
        trialEndsAt,
        isDemo: true,
        demoCreatedBy: admin.uid,
      };
      await tenantRef.set(tenantDoc);

      // 3. Create Owner User Profile
      const profileDoc: UserProfile = {
        uid,
        tenantId,
        role: 'owner',
        modules: [dto.module],
        email,
        displayName: dto.displayName?.trim() || dto.tenantName,
        status: 'active',
        membershipStatus: 'trial',
        trialStartedAt: nowIso,
        trialEndsAt,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      await this.usersCollection().doc(uid).set(profileDoc);

      // 4. Set custom claims
      await this.firebase.auth.setCustomUserClaims(uid, {
        tenantId,
        role: 'owner',
        modules: [dto.module],
      });

      // 5. Seed sample data if requested
      if (dto.seed !== false) {
        await seedDemoDataForModule(
          this.firebase,
          tenantId,
          uid,
          dto.module,
          dto.tenantName,
        );
      }

      await this.audit.record({
        adminUid: admin.uid,
        adminEmail: admin.email,
        action: 'DEMO_CREATED',
        targetType: 'demo',
        tenantId,
        targetId: tenantId,
        after: {
          tenantName: dto.tenantName,
          module: dto.module,
          email,
          days,
          trialEndsAt,
        },
      });

      return {
        success: true,
        tenantId,
        uid,
        email,
        password: plainPassword,
        module: dto.module,
        trialEndsAt,
      };
    } catch (err) {
      this.logger.error('Failed to create demo tenant', err as Error);
      // Rollback
      if (uid) {
        try {
          await this.firebase.auth.deleteUser(uid);
        } catch {
          void 0;
        }
        try {
          await this.usersCollection().doc(uid).delete();
        } catch {
          void 0;
        }
      }
      if (tenantId) {
        try {
          await this.tenantsCollection().doc(tenantId).delete();
        } catch {
          void 0;
        }
      }
      throw new AppException(ErrorCode.VALIDATION_ERROR, `Demo creation failed: ${(err as Error).message}`);
    }
  }

  async resetDemo(id: string, dto: ResetDemoDto, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    if (!tenant.isDemo) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Target tenant is not a demo');
    }

    const days = dto.days && dto.days > 0 ? dto.days : DEMO_DEFAULT_DAYS;
    const now = new Date();
    const trialEndsAt = addDaysToDate(now, days).toISOString();
    const nowIso = now.toISOString();

    // 1. Reset trial end date and status
    await tenantDoc.ref.update({
      membershipStatus: 'trial',
      trialEndsAt,
      status: 'active',
      suspendedAt: null,
      suspendedReason: null,
      updatedAt: nowIso,
    });

    // 2. Reactivate all users under this demo
    const usersSnap = await this.usersCollection().where('tenantId', '==', id).get();
    for (const uDoc of usersSnap.docs) {
      await uDoc.ref.update({
        status: 'active',
        membershipStatus: 'trial',
        trialEndsAt,
        suspendedByPlatform: false,
        updatedAt: nowIso,
      });
      try {
        await this.firebase.auth.updateUser(uDoc.id, { disabled: false });
      } catch {
        void 0;
      }
    }

    // 3. Reseed if requested
    if (dto.reseed && tenant.ownerUid && tenant.modules?.[0]) {
      await seedDemoDataForModule(
        this.firebase,
        id,
        tenant.ownerUid,
        tenant.modules[0],
        tenant.name,
      );
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'DEMO_RESET',
      targetType: 'demo',
      tenantId: id,
      targetId: id,
      after: { trialEndsAt, days, reseeded: Boolean(dto.reseed) },
    });

    return {
      success: true,
      trialEndsAt,
    };
  }

  async convertDemo(id: string, dto: ConvertDemoDto, admin: PlatformAdminUser) {
    const tenantDoc = await this.tenantsCollection().doc(id).get();
    if (!tenantDoc.exists) {
      throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
    }
    const tenant = tenantDoc.data() as TenantDocument;
    if (!tenant.isDemo) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, 'Target tenant is not a demo');
    }

    const nowIso = new Date().toISOString();

    // Remove isDemo flag and activate
    await tenantDoc.ref.update({
      isDemo: false,
      membershipStatus: 'active',
      status: 'active',
      planId: dto.planId,
      billingCycle: dto.billingCycle,
      updatedAt: nowIso,
    });

    // If requested, record manual payment
    let paymentResult: unknown = null;
    if (dto.recordPayment && dto.amountTRY) {
      paymentResult = await this.revenueService.recordManualPayment(
        id,
        {
          planId: dto.planId,
          billingCycle: dto.billingCycle,
          amountTRY: dto.amountTRY,
          notes: 'Converted from Demo account',
        },
        admin,
      );
    }

    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'DEMO_CONVERTED',
      targetType: 'demo',
      tenantId: id,
      targetId: id,
      after: {
        planId: dto.planId,
        billingCycle: dto.billingCycle,
        paymentRecorded: Boolean(dto.recordPayment),
      },
    });

    return {
      success: true,
      isDemo: false,
      membershipStatus: 'active',
      payment: paymentResult,
    };
  }

  /**
   * Daily Cron job:
   * 1. If trialEndsAt <= now -> set membershipStatus = 'expired'
   * 2. If trialEndsAt + 7 days <= now -> suspend tenant and users
   */
  async runExpiryJob(now = new Date()): Promise<{ expiredCount: number; suspendedCount: number }> {
    const snapshot = await this.tenantsCollection()
      .where('isDemo', '==', true)
      .get();

    const nowTime = now.getTime();
    let expiredCount = 0;
    let suspendedCount = 0;

    for (const doc of snapshot.docs) {
      const tenant = doc.data() as TenantDocument;
      if (tenant.deletedAt) continue;

      const trialEndMs = Date.parse(tenant.trialEndsAt ?? '');
      if (!Number.isFinite(trialEndMs)) continue;

      const isTimeExpired = nowTime > trialEndMs;
      const suspendThresholdMs = trialEndMs + DEMO_SUSPEND_AFTER_DAYS * 86_400_000;
      const shouldAutoSuspend = nowTime > suspendThresholdMs;

      // 1. Auto-suspend after 7 days
      if (shouldAutoSuspend && tenant.status !== 'inactive') {
        try {
          await this.tenantsService.suspend(
            tenant.id,
            { reason: 'Otomatik demo süresi bitişi (7 gün kuralı)' },
            { uid: 'system', email: 'system@odivon.com', status: 'active' },
          );
          suspendedCount++;
        } catch (err) {
          this.logger.error(`Failed to auto-suspend demo ${tenant.id}`, err as Error);
        }
      }
      // 2. Mark as expired on the day it ends
      else if (isTimeExpired && tenant.membershipStatus !== 'expired' && tenant.status === 'active') {
        try {
          await doc.ref.update({
            membershipStatus: 'expired',
            updatedAt: now.toISOString(),
          });
          await this.audit.record({
            adminUid: 'system',
            adminEmail: 'system@odivon.com',
            action: 'DEMO_EXPIRED',
            targetType: 'demo',
            tenantId: tenant.id,
            targetId: tenant.id,
            after: { membershipStatus: 'expired' },
          });
          expiredCount++;
        } catch (err) {
          this.logger.error(`Failed to mark demo ${tenant.id} as expired`, err as Error);
        }
      }
    }

    if (expiredCount > 0 || suspendedCount > 0) {
      this.logger.log(`Demo expiry cron completed: ${expiredCount} marked expired, ${suspendedCount} auto-suspended.`);
    }

    return { expiredCount, suspendedCount };
  }
}

function toIsoOrNull(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  const maybeTs = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
  if (typeof maybeTs.toDate === 'function') {
    const d = maybeTs.toDate();
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }
  const secs = maybeTs.seconds ?? maybeTs._seconds;
  if (typeof secs === 'number') return new Date(secs * 1000).toISOString();
  return null;
}

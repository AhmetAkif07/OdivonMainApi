import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { farmForbidden } from '../shared/farm-errors';
import { addDays, FARM_PLANS, TRIAL_DAYS, trialSubscription } from '../shared/farm-plans';
import { FARM_ROLE_TITLES } from '../shared/farm-roles';
import { FarmStore, toPlain } from '../shared/farm-store';
import {
  ChangeFarmPlanDto,
  QueueFarmMailDto,
  RecordFarmLoginDto,
  UpdateFarmSettingsDto,
} from './farm-core.dto';

/** The only account allowed to force its own trial into the expired state (sales demo). */
export const DEMO_EXPIRED_EMAIL = 'demo-expired@odivonfarm.com';

const SETTINGS_FIELDS = ['address', 'phone', 'countryCode', 'country', 'language'] as const;

@Injectable()
export class FarmCoreService {
  constructor(
    private readonly store: FarmStore,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
  ) {}

  /** Session bootstrap for OdivonFARM: farm, the caller's member card and role, subscription. */
  async me() {
    await this.ensureDefaults();
    const current = this.tenantContext.getStore();
    const [farm, member, role, subscription, profile] = await Promise.all([
      this.farm(),
      this.store.find(TENANT_COLLECTION.farmMembers, current.userId),
      this.store.currentRole(),
      this.subscription(),
      this.users.findByUid(current.userId),
    ]);
    return {
      uid: current.userId,
      email: current.email,
      displayName: profile?.displayName ?? (member?.['displayName'] as string | undefined) ?? null,
      tenantId: current.tenantId,
      isOwner: current.role === 'owner',
      role,
      member,
      farm,
      subscription,
    };
  }

  async farm() {
    const tenantId = this.store.tenantId();
    const [tenant, settings] = await Promise.all([
      this.tenants.getById(tenantId),
      this.store.find(TENANT_COLLECTION.farmSettings, tenantId),
    ]);
    return {
      id: tenant.id,
      name: tenant.name,
      ownerUid: tenant.ownerUid,
      logoUrl: tenant.logoUrl ?? null,
      ...Object.fromEntries(SETTINGS_FIELDS.map((key) => [key, settings?.[key] ?? ''])),
      createdAt: tenant.createdAt,
      updatedAt: settings?.['updatedAt'] ?? tenant.updatedAt,
    };
  }

  async updateSettings(dto: UpdateFarmSettingsDto) {
    await this.store.assertAdmin();
    const tenantId = this.store.tenantId();
    const name = dto.name?.trim();
    if (name) await this.tenants.update(tenantId, { name });

    const patch = Object.fromEntries(
      SETTINGS_FIELDS.filter((key) => dto[key] !== undefined).map((key) => [key, dto[key]]),
    );
    if (Object.keys(patch).length > 0) {
      await this.store.doc(TENANT_COLLECTION.farmSettings, tenantId).set(
        { ...patch, updatedAt: new Date().toISOString(), updatedBy: this.store.userId() },
        { merge: true },
      );
    }
    return this.farm();
  }

  async subscription() {
    const snapshot = await this.store
      .doc(TENANT_COLLECTION.farmSubscription, this.store.tenantId())
      .get();
    return snapshot.exists ? toPlain(snapshot.data()) : null;
  }

  async changePlan(dto: ChangeFarmPlanDto) {
    await this.store.assertAdmin();
    const plan = FARM_PLANS[dto.planId];
    const billingCycle = dto.billingCycle ?? 'monthly';
    const now = new Date();
    const patch = {
      planId: dto.planId,
      status: 'active',
      billingCycle,
      currentPeriodEnd: addDays(now, billingCycle === 'yearly' ? 365 : 30),
      animalLimit: plan.animalLimit,
      userLimit: plan.userLimit,
      storageLimitMb: plan.storageLimitMb,
      pricePaid: billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice,
      paymentMethod: dto.paymentMethod ?? 'credit_card',
      updatedAt: now.toISOString(),
    };
    const tenantId = this.store.tenantId();
    await this.store.doc(TENANT_COLLECTION.farmSubscription, tenantId).set(patch, { merge: true });
    await this.tenants.update(tenantId, { membershipStatus: 'active' });
    return this.subscription();
  }

  /** Demo account only: moves its trial 5 days into the past so the "expired" screens show. */
  async expireDemoTrial() {
    if (this.tenantContext.getStore().email.toLowerCase() !== DEMO_EXPIRED_EMAIL) {
      throw farmForbidden('Bu işlem yalnızca demo hesabı için kullanılabilir.');
    }
    const now = new Date();
    const expiredAt = addDays(now, -5);
    await this.store.doc(TENANT_COLLECTION.farmSubscription, this.store.tenantId()).set(
      {
        planId: 'trial',
        status: 'expired',
        billingCycle: 'monthly',
        startDate: addDays(now, -(TRIAL_DAYS + 5)),
        currentPeriodEnd: expiredAt,
        trialEndsAt: expiredAt,
        updatedAt: now.toISOString(),
      },
      { merge: true },
    );
    return this.subscription();
  }

  /** Login audit: a tenant-scoped log row, the member's "last active" and an activity entry. */
  async recordLogin(dto: RecordFarmLoginDto) {
    const current = this.tenantContext.getStore();
    const now = new Date().toISOString();
    const browser = dto.browser || 'Web İstemcisi';
    const os = dto.os || 'Bilinmiyor';
    const device = dto.device || 'Masaüstü';
    const member = await this.store.find(TENANT_COLLECTION.farmMembers, current.userId);
    const displayName =
      (member?.['displayName'] as string | undefined) || current.email.split('@')[0] || 'Kullanıcı';

    const logRef = this.store.collection(TENANT_COLLECTION.farmLoginLogs).doc();
    await logRef.set({
      id: logRef.id,
      uid: current.userId,
      email: current.email,
      displayName,
      farmId: current.tenantId,
      browser,
      os,
      device,
      userAgent: dto.userAgent ?? '',
      status: 'success',
      platform: 'web',
      loginAt: now,
      dateStr: now,
    });
    if (member) {
      await this.store
        .doc(TENANT_COLLECTION.farmMembers, current.userId)
        .update({ lastActiveAt: now, lastLoginAt: now });
    }
    await this.store.create(TENANT_COLLECTION.farmActivityLog, {
      actorUid: current.userId,
      actorName: displayName,
      actorEmail: current.email,
      action: 'Sisteme Giriş Yapıldı',
      category: 'guvenlik',
      message: `${displayName} (${current.email}), ${browser} (${os}) üzerinden sisteme giriş yaptı.`,
      icon: 'heroicons_solid:login',
      color: 'emerald',
      details: { browser, os, device, ipInfo: 'Web İstemci Doğrulaması', loginAt: now },
      date: now,
    });
    return { id: logRef.id };
  }

  /** A member may read their own login history; admins may read anyone's in the farm. */
  async loginLogs(uid: string, limit = 10) {
    const role = await this.store.requireRole();
    if (role !== 'admin' && uid !== this.store.userId()) {
      throw farmForbidden('Başka kullanıcıların giriş kayıtlarını yalnızca yönetici görebilir.');
    }
    const snapshot = await this.store
      .collection(TENANT_COLLECTION.farmLoginLogs)
      .where('uid', '==', uid)
      .get();
    return snapshot.docs
      .map((doc) => toPlain({ ...doc.data(), id: doc.id }) as Record<string, unknown>)
      .sort((a, b) => String(b['loginAt']).localeCompare(String(a['loginAt'])))
      .slice(0, limit)
      .map((log) => ({ ...log, timestamp: log['loginAt'] }));
  }

  /**
   * Queues an e-mail (welcome, invitation, kurban payment) for the SMTP sender. The queue is
   * tenant-scoped (`tenants/{tenantId}/farmMailQueue`) and each message has one recipient.
   */
  async queueMail(dto: QueueFarmMailDto) {
    await this.store.requireRole();
    const ref = this.store.collection(TENANT_COLLECTION.farmMailQueue).doc();
    await ref.set({
      id: ref.id,
      to: dto.to.map((email) => email.trim().toLowerCase()),
      from: 'Odivon Çiftlik Yönetimi <info@odivon.com>',
      replyTo: 'info@odivon.com',
      message: { subject: dto.subject, text: dto.text, html: dto.html },
      meta: dto.meta ?? {},
      status: 'pending',
      requestedBy: this.store.userId(),
      createdAt: new Date().toISOString(),
    });
    return { id: ref.id };
  }

  /** Idempotent: the owner's admin member card and the trial subscription. */
  async ensureDefaults(): Promise<void> {
    const tenantId = this.store.tenantId();
    const userId = this.store.userId();
    const memberRef = this.store.doc(TENANT_COLLECTION.farmMembers, userId);
    const subscriptionRef = this.store.doc(TENANT_COLLECTION.farmSubscription, tenantId);
    const [memberSnap, subscriptionSnap] = await this.store.db.getAll(memberRef, subscriptionRef);

    const writes: Promise<unknown>[] = [];
    if (!subscriptionSnap.exists) writes.push(subscriptionRef.set(trialSubscription(tenantId)));
    if (!memberSnap.exists && this.store.isOwner()) {
      const profile = await this.users.findByUid(userId);
      const email = (profile?.email ?? this.tenantContext.getStore().email).trim().toLowerCase();
      writes.push(
        memberRef.set(
          ownerMemberCard(tenantId, userId, email, profile?.displayName || email.split('@')[0]),
        ),
      );
    }
    await Promise.all(writes);
  }
}

export function ownerMemberCard(
  tenantId: string,
  uid: string,
  email: string,
  displayName: string,
  phone = '',
) {
  const now = new Date().toISOString();
  return {
    ...createBaseFields(uid, uid, now),
    farmId: tenantId,
    uid,
    email,
    displayName,
    phone,
    role: 'admin',
    status: 'active',
    title: FARM_ROLE_TITLES.admin,
    addedAt: now,
    deletedBy: null,
  };
}

import { Injectable } from '@nestjs/common';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { spaInvalid } from '../shared/spa-errors';
import {
  SPA_ROLE_PERMISSIONS,
  SPA_STAFF_ROLE_LABELS,
  SPA_STAFF_ROLES,
  spaRoleId,
} from '../shared/spa-roles';
import { DEFAULT_SPA_SETTINGS, SpaStore } from '../shared/spa-store';
import { parseClock } from '../shared/spa-time';
import { UpdateSpaSettingsDto } from './core.dto';

export const DEFAULT_STAFF_COLOR = '#6366f1';

@Injectable()
export class SpaCoreService {
  constructor(
    private readonly store: SpaStore,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
  ) {}

  /** Session bootstrap for the SPA client; also seeds the tenant's spa defaults on first use. */
  async me() {
    await this.ensureDefaults();
    const current = this.tenantContext.getStore();
    const [tenant, settings, staff, role] = await Promise.all([
      this.tenants.getById(current.tenantId),
      this.store.settings(),
      this.store.find(TENANT_COLLECTION.spaStaff, current.userId),
      this.store.currentRole(),
    ]);
    return {
      uid: current.userId,
      email: current.email,
      tenantId: current.tenantId,
      tenantName: tenant.name,
      role,
      isOwner: current.role === 'owner',
      staff,
      settings: this.toSettingsView(tenant.name, settings),
      permissions: current.permissions ?? {},
    };
  }

  async getSettings() {
    const [tenant, settings] = await Promise.all([
      this.tenants.getById(this.store.tenantId()),
      this.store.settings(),
    ]);
    return this.toSettingsView(tenant.name, settings);
  }

  async updateSettings(dto: UpdateSpaSettingsDto) {
    const current = await this.store.settings();
    const tenant = await this.tenants.getById(this.store.tenantId());
    const next = {
      timezone: dto.timezone ?? current.timezone,
      currency: dto.currency ?? current.currency,
      workDayStart: dto.workDayStart ?? current.workDayStart,
      workDayEnd: dto.workDayEnd ?? current.workDayEnd,
    };
    if ((parseClock(next.workDayStart) ?? 0) >= (parseClock(next.workDayEnd) ?? 0)) {
      throw spaInvalid('Mesai başlangıcı bitişten önce olmalıdır.');
    }
    if (!isValidTimeZone(next.timezone)) {
      throw spaInvalid('Geçersiz saat dilimi.');
    }
    await this.store.doc(TENANT_COLLECTION.spaSettings, this.store.tenantId()).set({
      ...current,
      ...next,
      updatedAt: new Date().toISOString(),
      updatedBy: this.store.userId(),
    });
    const name = dto.name?.trim();
    if (name && name !== tenant.name) {
      await this.tenants.update(tenant.id, { name });
    }
    await this.store.audit(
      'tenants',
      'update',
      tenant.id,
      { name: tenant.name, settings: pickSettings(current) },
      { name: name ?? tenant.name, settings: next },
    );
    return this.toSettingsView(name ?? tenant.name, { ...current, ...next });
  }

  /** Idempotent: default spa roles, settings and the owner's staff card. */
  async ensureDefaults(): Promise<void> {
    const tenantId = this.store.tenantId();
    const userId = this.store.userId();
    const rolesPath = tenantCollectionPath(tenantId, TENANT_COLLECTION.roles);
    const roleRefs = SPA_STAFF_ROLES.map((role) =>
      this.store.db.collection(rolesPath).doc(spaRoleId(role)),
    );
    const settingsRef = this.store.doc(TENANT_COLLECTION.spaSettings, tenantId);
    const ownerStaffRef = this.store.doc(TENANT_COLLECTION.spaStaff, userId);
    const [settingsSnap, ownerStaffSnap, ...roleSnaps] = await this.store.db.getAll(
      settingsRef,
      ownerStaffRef,
      ...roleRefs,
    );

    const writes: Promise<unknown>[] = [];
    roleSnaps.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      const role = SPA_STAFF_ROLES[index];
      writes.push(
        roleRefs[index].set({
          ...createBaseFields(spaRoleId(role), userId),
          name: `Spa - ${SPA_STAFF_ROLE_LABELS[role]}`,
          description: 'Spa modülü varsayılan rolü',
          permissions: SPA_ROLE_PERMISSIONS[role],
        }),
      );
    });
    if (!settingsSnap.exists) {
      writes.push(
        settingsRef.set({ ...createBaseFields(tenantId, userId), ...DEFAULT_SPA_SETTINGS }),
      );
    }
    if (!ownerStaffSnap.exists && this.store.isOwner()) {
      const profile = await this.users.findByUid(userId);
      const email = (profile?.email ?? this.tenantContext.getStore().email).trim().toLowerCase();
      writes.push(
        ownerStaffRef.set({
          ...createBaseFields(userId, userId),
          ad: profile?.displayName?.trim() || email,
          email,
          role: 'admin',
          uzmanliklar: [],
          primOraniVarsayilan: 0,
          renk: DEFAULT_STAFF_COLOR,
          active: true,
        }),
      );
    }
    await Promise.all(writes);
  }

  private toSettingsView(name: string, settings: typeof DEFAULT_SPA_SETTINGS) {
    return { name, settings: pickSettings(settings) };
  }
}

function pickSettings(settings: typeof DEFAULT_SPA_SETTINGS) {
  return {
    timezone: settings.timezone,
    currency: settings.currency,
    workDayStart: settings.workDayStart,
    workDayEnd: settings.workDayEnd,
  };
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

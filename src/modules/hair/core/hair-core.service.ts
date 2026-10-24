import { Injectable } from '@nestjs/common';
import { Transaction } from 'firebase-admin/firestore';
import { TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { createBaseFields, touchBaseFields } from '../../../shared/firestore/base-document';
import { TenantContext } from '../../../shared/tenancy/tenant.context';
import { IdentityRepository } from '../../identity/identity.repository';
import { TenantService } from '../../tenant/tenant.service';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { assertNoRelated, hairInvalid, hairPrecondition } from '../shared/hair-errors';
import {
  HAIR_ROLE_PERMISSIONS,
  HAIR_STAFF_ROLE_LABELS,
  HAIR_STAFF_ROLES,
  hairRoleId,
} from '../shared/hair-roles';
import { mergeSmsTemplates } from '../notifications/sms/sms-templates';
import { mergeDefinitions, normalizeDefinitions } from '../shared/hair-definitions';
import { slugCandidate, slugify } from '../shared/hair-slug';
import { DEFAULT_HAIR_SETTINGS, HairDoc, HairSettingsDoc, HairStore } from '../shared/hair-store';
import { parseClock } from '../shared/hair-time';
import { SaveHairBranchDto, UpdateHairSettingsDto } from './core.dto';

export const DEFAULT_STAFF_COLOR = '#6366f1';
/** Root collection mapping a public booking slug to its tenant and branch (plan §4.13). */
export const PUBLIC_SLUGS_COLLECTION = 'publicSlugs';
const DEFAULT_BRANCH_ID = 'main';
const MAX_SLUG_ATTEMPTS = 25;

@Injectable()
export class HairCoreService {
  constructor(
    private readonly store: HairStore,
    private readonly tenantContext: TenantContext,
    private readonly tenants: TenantService,
    private readonly users: IdentityRepository,
  ) {}

  /** Session bootstrap for the client; also seeds the tenant's hair defaults on first use. */
  async me() {
    await this.ensureDefaults();
    const current = this.tenantContext.getStore();
    const [tenant, settings, actor, branches] = await Promise.all([
      this.tenants.getById(current.tenantId),
      this.store.settings(),
      this.store.actor(),
      this.listBranches(),
    ]);
    const staff = actor?.staffId
      ? await this.store.find(TENANT_COLLECTION.hairStaff, actor.staffId)
      : null;
    return {
      uid: current.userId,
      email: current.email,
      tenantId: current.tenantId,
      tenantName: tenant.name,
      role: actor?.role ?? null,
      isOwner: current.role === 'owner',
      staff,
      branchIds: actor?.branchIds ?? null,
      branches,
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

  async updateSettings(dto: UpdateHairSettingsDto) {
    const current = await this.store.settings();
    const tenant = await this.tenants.getById(this.store.tenantId());
    const { name: rawName, ...rest } = dto;
    const next = {
      ...pickSettings(current),
      ...stripUndefined(rest),
      maxDiscountPercent: { ...current.maxDiscountPercent, ...stripUndefined(rest.maxDiscountPercent ?? {}) },
      smsTemplates: mergeSmsTemplates(current.smsTemplates, rest.smsTemplates),
      definitions: mergeDefinitions(current.definitions, normalizeDefinitions(rest.definitions)),
    };
    if ((parseClock(next.workDayStart) ?? 0) >= (parseClock(next.workDayEnd) ?? 0)) {
      throw hairInvalid('Mesai başlangıcı bitişten önce olmalıdır.');
    }
    if (!isValidTimeZone(next.timezone)) {
      throw hairInvalid('Geçersiz saat dilimi.');
    }
    await this.store.doc(TENANT_COLLECTION.hairSettings, this.store.tenantId()).set({
      ...current,
      ...next,
      updatedAt: new Date().toISOString(),
      updatedBy: this.store.userId(),
    });
    const name = rawName?.trim();
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

  // ── Branches ──

  /** Branches the caller may see: everything for owner/admin, otherwise their own branches. */
  async listBranches() {
    const actor = await this.store.actor();
    const page = await this.store.list(TENANT_COLLECTION.hairBranches, {
      orderBy: { field: 'name', dir: 'asc' },
      limit: 200,
      anyOf: actor?.branchIds ? { field: 'id', values: actor.branchIds } : undefined,
    });
    return page.items;
  }

  async getBranch(id: string) {
    const actor = await this.store.actorOrThrow();
    this.store.assertBranchAccess(actor, id);
    return this.store.getOrThrow(TENANT_COLLECTION.hairBranches, id, 'Şube bulunamadı');
  }

  async createBranch(dto: SaveHairBranchDto) {
    const name = dto.name?.trim();
    if (!name) throw hairInvalid('Şube adı zorunludur.');
    assertBranchHours(dto.workDayStart, dto.workDayEnd);
    const settings = await this.store.settings();
    const ref = this.store.newRef(TENANT_COLLECTION.hairBranches);

    const branch = await this.store.runTransaction(async (tx) => {
      const slug = await this.reserveSlug(tx, dto.slug, name, ref.id);
      const doc = this.store.stamp(ref, {
        name,
        slug,
        address: dto.address ?? '',
        phone: dto.phone ?? '',
        email: dto.email,
        workDayStart: dto.workDayStart ?? settings.workDayStart,
        workDayEnd: dto.workDayEnd ?? settings.workDayEnd,
        workDays: dto.workDays ?? [1, 2, 3, 4, 5, 6],
        slotDurationMinutes: dto.slotDurationMinutes ?? 15,
        logoUrl: dto.logoUrl || undefined,
        active: dto.active ?? true,
      });
      tx.set(ref, doc);
      tx.set(this.slugRef(slug), { slug, tenantId: this.store.tenantId(), branchId: ref.id });
      return doc;
    });
    await this.store.audit('hairBranches', 'create', ref.id, null, branch);
    return branch;
  }

  async updateBranch(id: string, dto: SaveHairBranchDto) {
    const current = await this.store.getOrThrow<HairDoc>(
      TENANT_COLLECTION.hairBranches,
      id,
      'Şube bulunamadı',
    );
    assertBranchHours(
      dto.workDayStart ?? (current['workDayStart'] as string),
      dto.workDayEnd ?? (current['workDayEnd'] as string),
    );
    const name = dto.name?.trim();
    if (dto.name !== undefined && !name) throw hairInvalid('Şube adı boş olamaz.');
    if (dto.active === false) await this.assertNotLastActiveBranch(id);

    const patch = { ...stripUndefined(dto), ...(name ? { name } : {}) };
    delete (patch as { slug?: string }).slug;
    const oldSlug = current['slug'] as string;
    const changesSlug = dto.slug !== undefined && dto.slug !== oldSlug;

    if (!changesSlug) {
      return this.store.update(TENANT_COLLECTION.hairBranches, 'hairBranches', id, patch, 'Şube bulunamadı');
    }

    const ref = this.store.ref(TENANT_COLLECTION.hairBranches, id);
    const updated = await this.store.runTransaction(async (tx) => {
      const slug = await this.reserveSlug(tx, dto.slug, current['name'] as string, id);
      const doc = { ...current, ...patch, slug, ...touchBaseFields(this.store.userId()) };
      tx.set(ref, doc);
      tx.set(this.slugRef(slug), { slug, tenantId: this.store.tenantId(), branchId: id });
      if (oldSlug) tx.delete(this.slugRef(oldSlug));
      return doc;
    });
    await this.store.audit('hairBranches', 'update', id, { slug: oldSlug }, { slug: updated.slug });
    return updated;
  }

  async deleteBranch(id: string) {
    const current = await this.store.getOrThrow<HairDoc>(
      TENANT_COLLECTION.hairBranches,
      id,
      'Şube bulunamadı',
    );
    await this.assertNotLastActiveBranch(id);
    const byBranch = { field: 'branchId', op: '==' as const, value: id };
    const [appointments, sessions, payments, expenses, products, staff] = await Promise.all([
      this.store.rows(TENANT_COLLECTION.hairAppointments, byBranch),
      this.store.rows(TENANT_COLLECTION.hairSessions, byBranch),
      this.store.rows(TENANT_COLLECTION.hairPayments, byBranch),
      this.store.rows(TENANT_COLLECTION.hairExpenses, byBranch),
      this.store.rows(TENANT_COLLECTION.hairProducts, byBranch),
      this.store.rows(TENANT_COLLECTION.hairStaff),
    ]);
    assertNoRelated('Şubeye ait kayıtlar var; silmek yerine şubeyi pasifleştirin.', {
      appointments: appointments.length,
      sessions: sessions.length,
      payments: payments.length,
      expenses: expenses.length,
      products: products.length,
      staff: staff.filter((s) => Array.isArray(s['branchIds']) && (s['branchIds'] as string[]).includes(id)).length,
    });
    const result = await this.store.softDelete(
      TENANT_COLLECTION.hairBranches,
      'hairBranches',
      id,
      'Şube bulunamadı',
    );
    const slug = current['slug'] as string | undefined;
    if (slug) await this.slugRef(slug).delete();
    return result;
  }

  // ── Defaults ──

  /** Idempotent: default hair roles, settings, the owner's staff card and a first branch. */
  async ensureDefaults(): Promise<void> {
    const tenantId = this.store.tenantId();
    const userId = this.store.userId();
    const rolesPath = tenantCollectionPath(tenantId, TENANT_COLLECTION.roles);
    const roleRefs = HAIR_STAFF_ROLES.map((role) =>
      this.store.db.collection(rolesPath).doc(hairRoleId(role)),
    );
    const settingsRef = this.store.doc(TENANT_COLLECTION.hairSettings, tenantId);
    const ownerStaffRef = this.store.doc(TENANT_COLLECTION.hairStaff, userId);
    const branchRef = this.store.doc(TENANT_COLLECTION.hairBranches, DEFAULT_BRANCH_ID);
    const [settingsSnap, ownerStaffSnap, branchSnap, ...roleSnaps] = await this.store.db.getAll(
      settingsRef,
      ownerStaffRef,
      branchRef,
      ...roleRefs,
    );

    const writes: Promise<unknown>[] = [];
    roleSnaps.forEach((snapshot, index) => {
      if (snapshot.exists) return;
      const role = HAIR_STAFF_ROLES[index];
      writes.push(
        roleRefs[index].set({
          ...createBaseFields(hairRoleId(role), userId),
          name: `Kuaför - ${HAIR_STAFF_ROLE_LABELS[role]}`,
          description: 'Kuaför modülü varsayılan rolü',
          permissions: HAIR_ROLE_PERMISSIONS[role],
        }),
      );
    });
    if (!settingsSnap.exists) {
      writes.push(
        settingsRef.set({ ...createBaseFields(tenantId, userId), ...DEFAULT_HAIR_SETTINGS }),
      );
    }
    if (!ownerStaffSnap.exists && this.store.isOwner()) {
      const profile = await this.users.findByUid(userId);
      const email = (profile?.email ?? this.tenantContext.getStore().email).trim().toLowerCase();
      const displayName = profile?.displayName?.trim() || email;
      const [firstName, ...rest] = displayName.split(/\s+/);
      writes.push(
        ownerStaffRef.set({
          ...createBaseFields(userId, userId),
          userId,
          inviteStatus: 'accepted',
          firstName,
          lastName: rest.join(' '),
          phone: '',
          email,
          role: 'admin',
          branchIds: [],
          specialties: [],
          serviceIds: [],
          defaultCommissionPercent: 0,
          workSchedule: [],
          hireDate: new Date().toISOString().slice(0, 10),
          active: true,
          onlineBookingEnabled: false,
          color: DEFAULT_STAFF_COLOR,
        }),
      );
    }
    if (!branchSnap.exists && (await this.noBranchExists())) {
      writes.push(this.createDefaultBranch(branchRef.id));
    }
    await Promise.all(writes);
  }

  private async noBranchExists(): Promise<boolean> {
    const snapshot = await this.store.collection(TENANT_COLLECTION.hairBranches).limit(1).get();
    return snapshot.empty;
  }

  private async createDefaultBranch(id: string) {
    const [tenant, settings] = await Promise.all([
      this.tenants.getById(this.store.tenantId()),
      this.store.settings(),
    ]);
    const ref = this.store.ref(TENANT_COLLECTION.hairBranches, id);
    await this.store.runTransaction(async (tx) => {
      if ((await tx.get(ref)).exists) return;
      const slug = await this.reserveSlug(tx, undefined, tenant.name, id);
      tx.set(
        ref,
        this.store.stamp(ref, {
          name: tenant.name,
          slug,
          address: '',
          phone: '',
          workDayStart: settings.workDayStart,
          workDayEnd: settings.workDayEnd,
          workDays: [1, 2, 3, 4, 5, 6],
          slotDurationMinutes: 15,
          active: true,
        }),
      );
      tx.set(this.slugRef(slug), { slug, tenantId: this.store.tenantId(), branchId: id });
    });
  }

  // ── Slugs ──

  private slugRef(slug: string) {
    return this.store.db.collection(PUBLIC_SLUGS_COLLECTION).doc(slug);
  }

  /**
   * Picks a globally unique slug inside the transaction (reads only — callers write afterwards).
   * An explicit slug must be free; a generated one gets `-2`, `-3`, … until a free one is found.
   */
  private async reserveSlug(
    tx: Transaction,
    explicit: string | undefined,
    fallbackName: string,
    branchId: string,
  ): Promise<string> {
    const taken = async (slug: string) => {
      const snap = await tx.get(this.slugRef(slug));
      return snap.exists && snap.data()?.['branchId'] !== branchId;
    };
    if (explicit) {
      if (await taken(explicit)) throw hairPrecondition('Bu adres (slug) başka bir şube tarafından kullanılıyor.');
      return explicit;
    }
    const base = slugify(fallbackName) || 'salon';
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = slugCandidate(base, attempt);
      if (!(await taken(candidate))) return candidate;
    }
    throw hairPrecondition('Uygun bir şube adresi üretilemedi, lütfen slug belirtin.');
  }

  private async assertNotLastActiveBranch(id: string) {
    const page = await this.store.list(TENANT_COLLECTION.hairBranches, {
      orderBy: { field: 'name', dir: 'asc' },
      limit: 200,
    });
    const others = page.items.filter((branch) => branch.id !== id && branch['active'] !== false);
    if (others.length === 0) {
      throw new AppException(ErrorCode.LAST_ACTIVE_BRANCH, 'En az bir aktif şube kalmalıdır.');
    }
  }

  private toSettingsView(name: string, settings: SettingsView) {
    return { name, settings: pickSettings(settings) };
  }
}

type SettingsView = Omit<HairSettingsDoc, keyof ReturnType<typeof createBaseFields>> | HairSettingsDoc;

const SETTINGS_KEYS = Object.keys(DEFAULT_HAIR_SETTINGS) as (keyof typeof DEFAULT_HAIR_SETTINGS)[];

function pickSettings(settings: SettingsView): typeof DEFAULT_HAIR_SETTINGS {
  return Object.fromEntries(
    SETTINGS_KEYS.map((key) => [
      key,
      key === 'definitions' ? mergeDefinitions(settings.definitions) : (settings[key] ?? DEFAULT_HAIR_SETTINGS[key]),
    ]),
  ) as typeof DEFAULT_HAIR_SETTINGS;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function assertBranchHours(start?: string, end?: string) {
  if (start === undefined && end === undefined) return;
  const open = parseClock(start);
  const close = parseClock(end);
  if (open !== undefined && close !== undefined && open >= close) {
    throw hairInvalid('Mesai başlangıcı bitişten önce olmalıdır.');
  }
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}


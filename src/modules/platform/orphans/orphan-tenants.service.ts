import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { DeleteOrphanTenantsDto, PurgeOrphanTenantStepDto } from './dto';

/** Tenants younger than this may still be in onboarding (tenant written before its user profile). */
const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Cloudflare Workers caps subrequests per invocation and every Firestore call is one, so a hard
 * delete runs in steps: each request spends at most this many Firestore calls, then the panel
 * calls again until the tenant is gone.
 */
const PURGE_STEP_BUDGET = 30;
const PURGE_PAGE_SIZE = 450;

/** Root-level index collections that point back to a tenant through a `tenantId` field. */
const TENANT_INDEX_COLLECTIONS = [
  ROOT_COLLECTION.gymAgentIndex,
  ROOT_COLLECTION.gymAgentPairingCodes,
  ROOT_COLLECTION.rentPublicTenants,
  ROOT_COLLECTION.apmPublicBranches,
  ROOT_COLLECTION.parkingAgentIndex,
  ROOT_COLLECTION.parkingAgentPairingCodes,
] as const;

export interface OrphanTenant {
  id: string;
  name: string;
  modules: string[];
  status: string;
  isDemo: boolean;
  ownerUid: string | null;
  /** Firestore user profiles that point to this tenant but have no Firebase Auth account. */
  staleProfileCount: number;
  createdAt: string;
  deletedAt: string | null;
  tooRecent: boolean;
}

export interface PurgeStepResult {
  tenantId: string;
  done: boolean;
  /** Documents deleted in this step. */
  deletedDocs: number;
}

export interface DeleteResult {
  tenantId: string;
  ok: boolean;
  error?: string;
}

@Injectable()
export class PlatformOrphanTenantsService {
  private readonly logger = new Logger(PlatformOrphanTenantsService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
  ) {}

  private tenantsCollection() {
    return this.firebase.db.collection(ROOT_COLLECTION.tenants);
  }

  /**
   * Tenants with no Firebase Auth account behind them: the owner, every Firestore profile
   * pointing at the tenant and every Auth user whose `tenantId` claim names it are all missing.
   */
  async list(): Promise<{ items: OrphanTenant[]; total: number; authUserCount: number }> {
    const [tenantsSnap, profilesByTenant, auth] = await Promise.all([
      this.tenantsCollection().get(),
      this.loadProfilesByTenant(),
      this.loadAuthUsers(),
    ]);
    const now = Date.now();

    const items: OrphanTenant[] = tenantsSnap.docs
      .map((d) => ({ ...(d.data() as TenantDocument), id: d.id }))
      .filter((t) => {
        if (auth.claimTenantIds.has(t.id)) return false;
        if (t.ownerUid && auth.uids.has(t.ownerUid)) return false;
        return !(profilesByTenant.get(t.id) ?? []).some((uid) => auth.uids.has(uid));
      })
      .map((t) => ({
        id: t.id,
        name: t.name ?? '',
        modules: t.modules ?? [],
        status: t.status,
        isDemo: Boolean(t.isDemo),
        ownerUid: t.ownerUid || null,
        staleProfileCount: (profilesByTenant.get(t.id) ?? []).length,
        createdAt: t.createdAt ?? '',
        deletedAt: t.deletedAt ?? null,
        tooRecent: this.isTooRecent(t.createdAt, now),
      }))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return { items, total: items.length, authUserCount: auth.uids.size };
  }

  async delete(dto: DeleteOrphanTenantsDto, admin: PlatformAdminUser) {
    const ids = [...new Set(dto.tenantIds.map((id) => id.trim()).filter(Boolean))];
    const reason = dto.reason?.trim() || null;
    const results: DeleteResult[] = [];

    for (const tenantId of ids) {
      try {
        await this.deleteOne(tenantId, dto.mode, reason, admin);
        results.push({ tenantId, ok: true });
      } catch (err) {
        results.push({ tenantId, ok: false, error: (err as Error).message });
      }
    }

    return {
      mode: dto.mode,
      deleted: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  private async deleteOne(
    tenantId: string,
    mode: 'soft' | 'hard',
    reason: string | null,
    admin: PlatformAdminUser,
  ) {
    const ref = this.tenantsCollection().doc(tenantId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error('İşletme bulunamadı');
    const tenant = snap.data() as TenantDocument;

    // Re-check on the server: the list in the panel may be stale
    const profiles = await this.firebase.db
      .collection(ROOT_COLLECTION.users)
      .where('tenantId', '==', tenantId)
      .get();
    const uidsToCheck = [...new Set([tenant.ownerUid, ...profiles.docs.map((d) => d.id)].filter(Boolean))];
    if (await this.anyAuthUserExists(uidsToCheck)) {
      throw new Error('İşletmeye bağlı Firebase Auth kullanıcısı var, silinmedi');
    }
    if (this.isTooRecent(tenant.createdAt, Date.now())) {
      throw new Error('Son 24 saatte oluşturulmuş, kurulumu sürüyor olabilir');
    }

    const before = {
      name: tenant.name,
      ownerUid: tenant.ownerUid,
      modules: tenant.modules,
      status: tenant.status,
      isDemo: Boolean(tenant.isDemo),
      createdAt: tenant.createdAt,
    };

    if (mode === 'hard') {
      throw new Error('Kalıcı silme purge-step ile parça parça yapılır');
    }

    {
      if (tenant.deletedAt) throw new Error('Zaten silinmiş');
      const now = new Date().toISOString();
      const patch = { deletedAt: now, status: 'inactive' as const, updatedAt: now, updatedBy: admin.uid };
      await ref.update(patch);
      await this.audit.record({
        adminUid: admin.uid,
        adminEmail: admin.email,
        action: 'TENANT_ORPHAN_SOFT_DELETED',
        targetType: 'tenant',
        tenantId,
        targetId: tenantId,
        before,
        after: patch,
        reason,
      });
      return;
    }

  }

  /**
   * One bounded slice of a hard delete: verifies the tenant is still orphaned, deletes up to
   * PURGE_STEP_BUDGET Firestore calls worth of sub-collection documents, and on the last step
   * removes index docs, stale profiles and the tenant document itself.
   */
  async purgeStep(dto: PurgeOrphanTenantStepDto, admin: PlatformAdminUser): Promise<PurgeStepResult> {
    const tenantId = dto.tenantId.trim();
    const reason = dto.reason?.trim() || null;
    let ops = 0;

    const ref = this.tenantsCollection().doc(tenantId);
    const snap = await ref.get();
    ops++;
    const tenant = snap.exists ? (snap.data() as TenantDocument) : null;

    const profiles = await this.firebase.db
      .collection(ROOT_COLLECTION.users)
      .where('tenantId', '==', tenantId)
      .get();
    ops++;
    const uidsToCheck = [...new Set([tenant?.ownerUid, ...profiles.docs.map((d) => d.id)].filter(Boolean))] as string[];
    if (uidsToCheck.length > 0) {
      ops += Math.ceil(uidsToCheck.length / 100);
      if (await this.anyAuthUserExists(uidsToCheck)) {
        throw new AppException(ErrorCode.PLATFORM_FORBIDDEN, 'İşletmeye bağlı Firebase Auth kullanıcısı var, silinmedi');
      }
    }
    if (tenant && this.isTooRecent(tenant.createdAt, Date.now())) {
      throw new AppException(ErrorCode.PLATFORM_FORBIDDEN, 'Son 24 saatte oluşturulmuş, kurulumu sürüyor olabilir');
    }

    // Hide the tenant everywhere while its data is being removed
    if (tenant && !tenant.deletedAt) {
      const now = new Date().toISOString();
      await ref.update({ deletedAt: now, status: 'inactive', updatedAt: now, updatedBy: admin.uid });
      ops++;
    }

    let deletedDocs = 0;
    const collections = await ref.listCollections();
    ops++;
    for (const col of collections) {
      while (ops + 2 <= PURGE_STEP_BUDGET) {
        const page = await col.select().limit(PURGE_PAGE_SIZE).get();
        ops++;
        if (page.empty) break;
        const batch = this.firebase.db.batch();
        page.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        ops++;
        deletedDocs += page.size;
        if (page.size < PURGE_PAGE_SIZE) break;
      }
      if (ops + 2 > PURGE_STEP_BUDGET) {
        return { tenantId, done: false, deletedDocs };
      }
    }

    // Final step needs a fresh budget for index cleanup, profiles and the tenant doc
    const finalStepCost = TENANT_INDEX_COLLECTIONS.length * 2 + 3;
    if (collections.length > 0 && ops + finalStepCost > PURGE_STEP_BUDGET) {
      return { tenantId, done: false, deletedDocs };
    }

    await this.deleteTenantIndexes(tenantId);
    if (!profiles.empty) {
      const batch = this.firebase.db.batch();
      profiles.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    if (snap.exists) {
      await ref.delete();
    }
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'TENANT_ORPHAN_PURGED',
      targetType: 'tenant',
      tenantId,
      targetId: tenantId,
      before: tenant
        ? {
            name: tenant.name,
            ownerUid: tenant.ownerUid,
            modules: tenant.modules,
            isDemo: Boolean(tenant.isDemo),
            createdAt: tenant.createdAt,
            staleProfilesDeleted: profiles.size,
          }
        : { staleProfilesDeleted: profiles.size },
      after: null,
      reason,
    });

    return { tenantId, done: true, deletedDocs };
  }

  private async deleteTenantIndexes(tenantId: string) {
    for (const name of TENANT_INDEX_COLLECTIONS) {
      try {
        const snap = await this.firebase.db.collection(name).where('tenantId', '==', tenantId).get();
        if (snap.empty) continue;
        const batch = this.firebase.db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch (err) {
        this.logger.warn(`Could not clean ${name} for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }

  private async loadProfilesByTenant() {
    const snap = await this.firebase.db.collection(ROOT_COLLECTION.users).select('tenantId').get();
    const byTenant = new Map<string, string[]>();
    snap.docs.forEach((d) => {
      const tenantId = d.get('tenantId');
      if (typeof tenantId !== 'string' || !tenantId) return;
      const list = byTenant.get(tenantId) ?? [];
      list.push(d.id);
      byTenant.set(tenantId, list);
    });
    return byTenant;
  }

  /** Every Firebase Auth account, plus the tenant ids found in their custom claims. */
  private async loadAuthUsers() {
    const uids = new Set<string>();
    const claimTenantIds = new Set<string>();
    let pageToken: string | undefined;
    do {
      const page = await this.firebase.auth.listUsers(1000, pageToken);
      page.users.forEach((u) => {
        uids.add(u.uid);
        const claimTenant = u.customClaims?.['tenantId'];
        if (typeof claimTenant === 'string' && claimTenant) claimTenantIds.add(claimTenant);
      });
      pageToken = page.pageToken;
    } while (pageToken);
    return { uids, claimTenantIds };
  }

  private async anyAuthUserExists(uids: string[]) {
    for (let i = 0; i < uids.length; i += 100) {
      const res = await this.firebase.auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
      if (res.users.length > 0) return true;
    }
    return false;
  }

  private isTooRecent(createdAt: string | undefined, now: number) {
    const created = createdAt ? Date.parse(createdAt) : NaN;
    return Number.isFinite(created) && now - created < MIN_ORPHAN_AGE_MS;
  }
}

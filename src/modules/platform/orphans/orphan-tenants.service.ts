import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION } from '../../../shared/firebase/firestore-path';
import { TenantDocument } from '../../tenant/entities/tenant.entity';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { DeleteOrphanTenantsDto } from './dto';

/** Tenants younger than this may still be in onboarding (tenant written before its user profile). */
const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

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
  ownerAuthExists: boolean;
  ownerEmail: string | null;
  createdAt: string;
  deletedAt: string | null;
  tooRecent: boolean;
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

  /** Tenants that no document in `users` points to via `tenantId`. */
  async list(): Promise<{ items: OrphanTenant[]; total: number }> {
    const [tenantsSnap, usersSnap] = await Promise.all([
      this.tenantsCollection().get(),
      this.firebase.db.collection(ROOT_COLLECTION.users).select('tenantId').get(),
    ]);

    const tenantIdsWithUsers = new Set<string>();
    usersSnap.docs.forEach((d) => {
      const tenantId = d.get('tenantId');
      if (typeof tenantId === 'string' && tenantId) tenantIdsWithUsers.add(tenantId);
    });

    const orphans = tenantsSnap.docs
      .map((d) => ({ ...(d.data() as TenantDocument), id: d.id }))
      .filter((t) => !tenantIdsWithUsers.has(t.id));

    const ownerAuth = await this.lookupAuthUsers(orphans.map((t) => t.ownerUid).filter(Boolean));
    const now = Date.now();

    const items: OrphanTenant[] = orphans
      .map((t) => {
        const auth = t.ownerUid ? ownerAuth.get(t.ownerUid) : undefined;
        return {
          id: t.id,
          name: t.name ?? '',
          modules: t.modules ?? [],
          status: t.status,
          isDemo: Boolean(t.isDemo),
          ownerUid: t.ownerUid || null,
          ownerAuthExists: Boolean(auth),
          ownerEmail: auth?.email ?? null,
          createdAt: t.createdAt ?? '',
          deletedAt: t.deletedAt ?? null,
          tooRecent: this.isTooRecent(t.createdAt, now),
        };
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    return { items, total: items.length };
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
    const users = await this.firebase.db
      .collection(ROOT_COLLECTION.users)
      .where('tenantId', '==', tenantId)
      .limit(1)
      .get();
    if (!users.empty) throw new Error('İşletmeye bağlı kullanıcı var, silinmedi');
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

    if (mode === 'soft') {
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

    await this.firebase.db.recursiveDelete(ref);
    await this.deleteTenantIndexes(tenantId);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'TENANT_ORPHAN_PURGED',
      targetType: 'tenant',
      tenantId,
      targetId: tenantId,
      before,
      after: null,
      reason,
    });
  }

  private async deleteTenantIndexes(tenantId: string) {
    for (const name of TENANT_INDEX_COLLECTIONS) {
      try {
        const snap = await this.firebase.db.collection(name).where('tenantId', '==', tenantId).get();
        await Promise.all(snap.docs.map((d) => d.ref.delete()));
      } catch (err) {
        this.logger.warn(`Could not clean ${name} for tenant ${tenantId}: ${(err as Error).message}`);
      }
    }
  }

  private async lookupAuthUsers(uids: string[]) {
    const result = new Map<string, { email: string | null }>();
    const unique = [...new Set(uids)];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      try {
        const res = await this.firebase.auth.getUsers(chunk.map((uid) => ({ uid })));
        res.users.forEach((u) => result.set(u.uid, { email: u.email ?? null }));
      } catch (err) {
        this.logger.warn(`Auth lookup failed for orphan tenant owners: ${(err as Error).message}`);
      }
    }
    return result;
  }

  private isTooRecent(createdAt: string | undefined, now: number) {
    const created = createdAt ? Date.parse(createdAt) : NaN;
    return Number.isFinite(created) && now - created < MIN_ORPHAN_AGE_MS;
  }
}

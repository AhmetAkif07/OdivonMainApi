import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { AppException } from '../../../shared/errors/app.exception';
import { ErrorCode } from '../../../shared/errors/error-codes';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { compareVersions } from '../../../shared/http/client-version.guard';
import { TenantClientVersion, TenantDocument } from '../../tenant/entities/tenant.entity';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { PlatformAdminUser } from '../platform-admin.guard';
import { CreateReleaseDto, ListReleasesQueryDto, UpdateReleaseDto } from './dto';
import { PlatformRelease, TenantVersionEvent } from './release.types';

export type TenantVersionStatus = 'up_to_date' | 'outdated' | 'ahead' | 'unknown';

/** Newest first by version number, then by release date. */
export function sortReleases(items: PlatformRelease[]): PlatformRelease[] {
  return [...items].sort(
    (a, b) => compareVersions(b.version, a.version) || b.releasedAt.localeCompare(a.releasedAt),
  );
}

export function versionStatus(current: string | null | undefined, latest: string | null | undefined): TenantVersionStatus {
  if (!current || !latest) return 'unknown';
  const diff = compareVersions(current, latest);
  return diff === 0 ? 'up_to_date' : diff < 0 ? 'outdated' : 'ahead';
}

@Injectable()
export class PlatformReleasesService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: PlatformAuditService,
  ) {}

  private collection() {
    return this.firebase.db.collection(ROOT_COLLECTION.platformReleases);
  }

  private async loadAll(): Promise<PlatformRelease[]> {
    const snapshot = await this.collection().get();
    return snapshot.docs.map((d) => d.data() as PlatformRelease);
  }

  private latestByModule(items: PlatformRelease[]): Partial<Record<ProductModule, PlatformRelease>> {
    const latest: Partial<Record<ProductModule, PlatformRelease>> = {};
    for (const release of sortReleases(items)) {
      latest[release.module] ??= release;
    }
    return latest;
  }

  async list(query: ListReleasesQueryDto) {
    const all = await this.loadAll();
    const modules = query.module && query.module !== 'all' ? query.module.split(',').map((m) => m.trim()) : null;
    const items = sortReleases(modules ? all.filter((r) => modules.includes(r.module)) : all);
    return { items, total: items.length, latestByModule: this.latestByModule(all) };
  }

  async create(dto: CreateReleaseDto, admin: PlatformAdminUser): Promise<PlatformRelease> {
    const version = dto.version.trim();
    const existing = await this.collection().where('module', '==', dto.module).get();
    if (existing.docs.some((d) => (d.data() as PlatformRelease).version === version)) {
      throw new AppException(ErrorCode.RELEASE_CONFLICT, `${dto.module} ${version} zaten kayıtlı`);
    }
    const now = new Date().toISOString();
    const ref = this.collection().doc();
    const release: PlatformRelease = {
      id: ref.id,
      module: dto.module,
      version,
      title: dto.title.trim(),
      notes: dto.notes?.trim() || null,
      type: dto.type ?? 'minor',
      releasedAt: dto.releasedAt ? new Date(dto.releasedAt).toISOString() : now,
      createdAt: now,
      updatedAt: now,
      createdBy: admin.email,
    };
    await ref.set(release);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'RELEASE_CREATED',
      targetType: 'release',
      targetId: release.id,
      after: { module: release.module, version: release.version, title: release.title },
    });
    return release;
  }

  async update(id: string, dto: UpdateReleaseDto, admin: PlatformAdminUser): Promise<PlatformRelease> {
    const ref = this.collection().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.RELEASE_NOT_FOUND, 'Sürüm kaydı bulunamadı');
    const current = snap.data() as PlatformRelease;

    if (dto.version && dto.version.trim() !== current.version) {
      const version = dto.version.trim();
      const siblings = await this.collection().where('module', '==', current.module).get();
      if (siblings.docs.some((d) => d.id !== id && (d.data() as PlatformRelease).version === version)) {
        throw new AppException(ErrorCode.RELEASE_CONFLICT, `${current.module} ${version} zaten kayıtlı`);
      }
    }

    const patch: Partial<PlatformRelease> = {
      ...(dto.version ? { version: dto.version.trim() } : {}),
      ...(dto.title ? { title: dto.title.trim() } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      ...(dto.type ? { type: dto.type } : {}),
      ...(dto.releasedAt ? { releasedAt: new Date(dto.releasedAt).toISOString() } : {}),
      updatedAt: new Date().toISOString(),
    };
    await ref.update(patch);
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'RELEASE_UPDATED',
      targetType: 'release',
      targetId: id,
      before: { version: current.version, title: current.title, type: current.type, releasedAt: current.releasedAt },
      after: patch,
    });
    return { ...current, ...patch };
  }

  async remove(id: string, admin: PlatformAdminUser) {
    const ref = this.collection().doc(id);
    const snap = await ref.get();
    if (!snap.exists) throw new AppException(ErrorCode.RELEASE_NOT_FOUND, 'Sürüm kaydı bulunamadı');
    const current = snap.data() as PlatformRelease;
    await ref.delete();
    await this.audit.record({
      adminUid: admin.uid,
      adminEmail: admin.email,
      action: 'RELEASE_DELETED',
      targetType: 'release',
      targetId: id,
      before: { module: current.module, version: current.version, title: current.title },
    });
    return { success: true };
  }

  /** Per module: latest release and how many tenants run which version. */
  async overview() {
    const [releases, tenantsSnap] = await Promise.all([
      this.loadAll(),
      this.firebase.db.collection(ROOT_COLLECTION.tenants).get(),
    ]);
    const latest = this.latestByModule(releases);
    const tenants = tenantsSnap.docs.map((d) => d.data() as TenantDocument).filter((t) => !t.deletedAt);

    const modules = PRODUCT_MODULES.filter(
      (m) => latest[m] || tenants.some((t) => t.modules?.includes(m)),
    );

    return {
      modules: modules.map((module) => {
        const moduleTenants = tenants.filter((t) => t.modules?.includes(module));
        const latestVersion = latest[module]?.version ?? null;
        const versions = new Map<string, number>();
        const counts = { up_to_date: 0, outdated: 0, ahead: 0, unknown: 0 };
        let reportedCount = 0;
        for (const tenant of moduleTenants) {
          const current = tenant.clientVersions?.[module]?.version;
          if (!current) continue;
          reportedCount++;
          versions.set(current, (versions.get(current) ?? 0) + 1);
          counts[versionStatus(current, latestVersion)]++;
        }
        return {
          module,
          latest: latest[module] ?? null,
          releaseCount: releases.filter((r) => r.module === module).length,
          tenantCount: moduleTenants.length,
          reportedCount,
          notReportedCount: moduleTenants.length - reportedCount,
          upToDateCount: counts.up_to_date,
          outdatedCount: counts.outdated,
          aheadCount: counts.ahead,
          versions: [...versions.entries()]
            .map(([version, count]) => ({ version, count }))
            .sort((a, b) => compareVersions(b.version, a.version)),
        };
      }),
    };
  }

  /** A tenant's running version per module, compared with the latest release, plus its change log. */
  async tenantVersions(tenantId: string, tenant?: TenantDocument) {
    let doc = tenant;
    if (!doc) {
      const snap = await this.firebase.db.collection(ROOT_COLLECTION.tenants).doc(tenantId).get();
      if (!snap.exists) throw new AppException(ErrorCode.TENANT_NOT_FOUND, 'Tenant not found');
      doc = snap.data() as TenantDocument;
    }
    const [releases, historySnap] = await Promise.all([
      this.loadAll(),
      this.firebase.db
        .collection(tenantCollectionPath(tenantId, TENANT_COLLECTION.versionHistory))
        .orderBy('at', 'desc')
        .limit(50)
        .get(),
    ]);
    const latest = this.latestByModule(releases);
    const reported = Object.keys(doc.clientVersions ?? {}) as ProductModule[];
    const modules = [...new Set([...(doc.modules ?? []), ...reported])];

    return {
      modules: modules.map((module) => {
        const current: TenantClientVersion | null = doc.clientVersions?.[module] ?? null;
        const latestRelease = latest[module] ?? null;
        return {
          module,
          current,
          latest: latestRelease,
          status: versionStatus(current?.version, latestRelease?.version),
        };
      }),
      history: historySnap.docs
        .map((d) => d.data() as TenantVersionEvent)
        .sort((a, b) => b.at.localeCompare(a.at)),
    };
  }
}

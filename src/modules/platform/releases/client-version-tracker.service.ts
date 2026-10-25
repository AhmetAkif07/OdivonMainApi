import { Injectable, Logger } from '@nestjs/common';
import { FirebaseService } from '../../../shared/firebase/firebase.service';
import { ROOT_COLLECTION, TENANT_COLLECTION, tenantCollectionPath } from '../../../shared/firebase/firestore-path';
import { PRODUCT_MODULES, ProductModule } from '../../../shared/authorization/constants';
import { TenantClientVersion, TenantDocument } from '../../tenant/entities/tenant.entity';
import { TenantVersionEvent } from './release.types';

/** How long a seen version is trusted before lastSeenAt is refreshed in Firestore. */
const REFRESH_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE = 5000;
const ROUTE_TO_MODULE: Record<string, ProductModule> = { 'driving-school': 'drivingschool' };
const VERSION_PATTERN = /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/;

export function moduleFromRoute(segment: string | null, userModules: ProductModule[]): ProductModule | null {
  const mapped = segment ? (ROUTE_TO_MODULE[segment] ?? segment) : null;
  if (mapped && (PRODUCT_MODULES as readonly string[]).includes(mapped)) return mapped as ProductModule;
  // Shared routes (identity, notifications, …): attribute them only when the user has a single product.
  return userModules.length === 1 ? userModules[0] : null;
}

/**
 * Records which app version each tenant runs, per product, from the X-Client-Version header the
 * tenant panels already send. Writes only when the version changes or the last write is old, so a
 * busy tenant costs a few Firestore operations per isolate every few hours.
 */
@Injectable()
export class ClientVersionTracker {
  private readonly logger = new Logger(ClientVersionTracker.name);
  private readonly seen = new Map<string, { version: string; checkedAt: number }>();

  constructor(private readonly firebase: FirebaseService) {}

  /** True when this call has nothing to write (used by the interceptor to skip background work). */
  isFresh(tenantId: string, module: ProductModule, version: string, now = Date.now()): boolean {
    const hit = this.seen.get(`${tenantId}:${module}`);
    return !!hit && hit.version === version && now - hit.checkedAt < REFRESH_MS;
  }

  async record(input: { tenantId: string; module: ProductModule; version: string; userId?: string | null }): Promise<void> {
    const version = input.version.trim().slice(0, 40);
    if (!VERSION_PATTERN.test(version)) return;
    const key = `${input.tenantId}:${input.module}`;
    const nowMs = Date.now();
    if (this.isFresh(input.tenantId, input.module, version, nowMs)) return;
    this.remember(key, version, nowMs);

    try {
      const ref = this.firebase.db.collection(ROOT_COLLECTION.tenants).doc(input.tenantId);
      const snap = await ref.get();
      if (!snap.exists) return;
      const tenant = snap.data() as TenantDocument;
      const previous = tenant.clientVersions?.[input.module];
      const now = new Date(nowMs).toISOString();

      if (previous?.version === version && nowMs - Date.parse(previous.lastSeenAt) < REFRESH_MS) return;

      const entry: TenantClientVersion = {
        version,
        firstSeenAt: previous?.version === version ? previous.firstSeenAt : now,
        lastSeenAt: now,
        lastSeenBy: input.userId ?? null,
      };
      await ref.update({ clientVersions: { ...(tenant.clientVersions ?? {}), [input.module]: entry } });

      if (previous?.version !== version) {
        const historyRef = this.firebase.db
          .collection(tenantCollectionPath(input.tenantId, TENANT_COLLECTION.versionHistory))
          .doc();
        const event: TenantVersionEvent = {
          id: historyRef.id,
          module: input.module,
          fromVersion: previous?.version ?? null,
          toVersion: version,
          at: now,
          userId: input.userId ?? null,
        };
        await historyRef.set(event);
      }
    } catch (error) {
      this.seen.delete(key);
      this.logger.warn(`Client version not recorded for ${key}: ${(error as Error).message}`);
    }
  }

  private remember(key: string, version: string, at: number) {
    if (this.seen.size >= MAX_CACHE) this.seen.clear();
    this.seen.set(key, { version, checkedAt: at });
  }
}

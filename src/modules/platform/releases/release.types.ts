import { ProductModule } from '../../../shared/authorization/constants';

export const RELEASE_TYPES = ['major', 'minor', 'patch', 'hotfix'] as const;
export type ReleaseType = (typeof RELEASE_TYPES)[number];

/** One published app version of a product module (platformReleases/{id}). */
export interface PlatformRelease {
  id: string;
  module: ProductModule;
  version: string;
  title: string;
  notes: string | null;
  type: ReleaseType;
  releasedAt: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

/** A change of a tenant's running version (tenants/{id}/versionHistory/{id}). */
export interface TenantVersionEvent {
  id: string;
  module: ProductModule;
  fromVersion: string | null;
  toVersion: string;
  at: string;
  userId: string | null;
}

import { ProductModule } from '../../../shared/authorization/constants';
import { BaseDocument } from '../../../shared/firestore/base-document';

export type TenantMembershipStatus = 'trial' | 'active' | 'expired' | 'cancelled';

/** The app version a tenant's users last ran for one product, from their X-Client-Version header. */
export interface TenantClientVersion {
  version: string;
  firstSeenAt: string;
  lastSeenAt: string;
  lastSeenBy?: string | null;
}

export interface TenantDocument extends BaseDocument {
  name: string;
  ownerUid: string;
  modules: ProductModule[];
  status: 'active' | 'inactive';
  onboardingCompleted?: boolean;
  membershipStatus?: TenantMembershipStatus;
  trialEndsAt?: string | null;
  /** End of the paid Odivon subscription period (written by billing after a verified payment). */
  subscriptionEndsAt?: string | null;
  logoUrl?: string | null;
  planId?: string | null;
  billingCycle?: 'monthly' | 'yearly' | null;
  isDemo?: boolean;
  demoCreatedBy?: string | null;
  suspendedAt?: string | null;
  suspendedReason?: string | null;
  /** Last reported app version per product module (written by ClientVersionTracker). */
  clientVersions?: Partial<Record<ProductModule, TenantClientVersion>>;
}

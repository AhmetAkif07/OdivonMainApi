import { ProductModule } from '../../../shared/authorization/constants';
import { BaseDocument } from '../../../shared/firestore/base-document';

export type TenantMembershipStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export interface TenantDocument extends BaseDocument {
  name: string;
  ownerUid: string;
  modules: ProductModule[];
  status: 'active' | 'inactive';
  onboardingCompleted?: boolean;
  membershipStatus?: TenantMembershipStatus;
  trialEndsAt?: string | null;
  logoUrl?: string | null;
}

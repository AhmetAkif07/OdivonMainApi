import { ProductModule, UserRole } from '../../../shared/authorization/constants';

export type UserStatus = 'active' | 'inactive';

export type MembershipStatus = 'trial' | 'active' | 'expired' | 'cancelled';

export type AccountType = 'gym_member' | 'staff';

export interface UserProfile {
  uid: string;
  tenantId: string;
  role: UserRole;
  accountType?: AccountType;
  modules: ProductModule[];
  email: string;
  emailVerified?: boolean;
  emailVerificationToken?: string | null;
  emailVerificationExpiresAt?: string | null;
  displayName?: string | null;
  roleIds?: string[];
  branchIds?: string[];
  allBranches?: boolean;
  status: UserStatus;
  suspendedByPlatform?: boolean;
  phone?: string | null;
  membershipStatus?: MembershipStatus;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

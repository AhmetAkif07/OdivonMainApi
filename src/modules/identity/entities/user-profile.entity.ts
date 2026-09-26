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
  displayName?: string | null;
  roleIds?: string[];
  status: UserStatus;
  phone?: string | null;
  membershipStatus?: MembershipStatus;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

import { ProductModule, UserRole } from '../../../shared/authorization/constants';

export type UserStatus = 'active' | 'inactive';

export interface UserProfile {
  uid: string;
  tenantId: string;
  role: UserRole;
  modules: ProductModule[];
  email: string;
  displayName?: string | null;
  roleIds?: string[];
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
}

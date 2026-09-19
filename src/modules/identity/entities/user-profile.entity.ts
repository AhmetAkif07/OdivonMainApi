import { ProductModule, UserRole } from '../../../shared/authorization/constants';

export interface UserProfile {
  uid: string;
  tenantId: string;
  role: UserRole;
  modules: ProductModule[];
  email: string;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

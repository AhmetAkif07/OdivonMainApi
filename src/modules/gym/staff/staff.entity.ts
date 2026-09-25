import { BaseDocument } from '../../../shared/firestore/base-document';

export type GymStaffRole = 'owner' | 'admin' | 'trainer' | 'receptionist' | 'user';
export type GymStaffStatus = 'active' | 'inactive' | 'leave';

export interface GymStaff extends BaseDocument {
  displayName: string;
  email: string;
  phone: string | null;
  role: GymStaffRole;
  title: string;
  branchId: string | null;
  branchName: string | null;
  specialties: string[];
  customPermissions: string[];
  status: GymStaffStatus;
  hireDate: string | null;
  emergencyContact: string | null;
  monthlySalary: number;
  commissionRate: number;
  notes: string | null;
  avatarUrl: string | null;
}

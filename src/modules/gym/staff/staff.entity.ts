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
  /** Çok şubeli personel; eski kayıtlarda yalnız branchId vardır. */
  branchIds?: string[];
  branchNames?: string[];
  specialties: string[];
  customPermissions: string[];
  status: GymStaffStatus;
  hireDate: string | null;
  emergencyContact: string | null;
  monthlySalary: number;
  commissionRate: number;
  notes: string | null;
  avatarUrl: string | null;
  /** Firebase Auth kullanıcı kimliği (login UID) */
  userId?: string | null;
}

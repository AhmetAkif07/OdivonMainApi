import { BaseDocument } from '../../../shared/firestore/base-document';
import { MembershipStatus } from '../../identity/entities/user-profile.entity';

export type GymMemberGender = 'female' | 'male' | 'unspecified';

export interface GymMember extends BaseDocument {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string | null;
  phone: string | null;
  /** T.C. kimlik no; eski kayıtlarda alan yok. */
  nationalId?: string | null;
  gender: GymMemberGender;
  birthDate: string | null;
  membershipStatus: MembershipStatus;
  membershipStartsAt: string | null;
  membershipEndsAt: string | null;
  packageLabel: string | null;
  packagePrice: number | null;
  notes: string | null;
  country: string | null;
  language: string | null;
  walletBalance: number;
  branchId: string | null;
  branchName: string | null;
  memberNumber: string;
  trainerId: string | null;
  trainerName: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  emergencyContactRelation: string | null;
  bloodGroup: string | null;
  allergies: string | null;
  chronicDiseases: string | null;
  specialInfo: string | null;
  rfidCardNumber: string | null;
  cardDepositFee: number;
  cardDepositPaid: boolean;
  isArchived: boolean;
  archivedAt: string | null;
  autoRenew?: boolean;
  /** Group-class credits of the current package period; null = unlimited (or no credit system). */
  classCreditsTotal?: number | null;
  classCreditsUsed?: number;
  /** Booked classes not attended (marked by staff or closed automatically the next day). */
  noShowCount?: number;
  waterTargetMl?: number;
  /** Lead (guest-member record) this member was converted from, and its source. */
  leadId?: string | null;
  leadSource?: string | null;
  /** Member who referred this one (referral programme). */
  referredByMemberId?: string | null;
  referredByName?: string | null;
}

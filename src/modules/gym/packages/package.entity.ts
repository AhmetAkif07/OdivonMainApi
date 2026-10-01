import { BaseDocument } from '../../../shared/firestore/base-document';

export interface GymPackage extends BaseDocument {
  name: string;
  category: string;
  durationDays: number;
  durationType: 'day' | 'month' | 'year';
  durationValue: number;
  price: number;
  description: string;
  features: string[];
  maxFreeze: number;
  trialEligible: boolean;
  allowedDays: number[];
  checkInStartTime: string;
  checkInEndTime: string;
  sessionCount: number | null;
  /** Group-class credits per membership period; null/absent = unlimited classes. */
  classCredits?: number | null;
  isUnlimitedSessions: boolean;
  barcode: string;
  isHidden: boolean;
  status: 'active' | 'inactive' | 'archived';
  branchId: string | null;
  branchName: string | null;
}

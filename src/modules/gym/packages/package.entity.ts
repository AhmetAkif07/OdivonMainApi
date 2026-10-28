import { BaseDocument } from '../../../shared/firestore/base-document';

export type PackageScope = 'gym' | 'trainer';

export interface TrainerPackagePricing {
  trainerId: string;
  trainerName: string;
  price: number;
  sessionCount?: number | null;
  commissionRate?: number | null;
}

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
  requiredDocuments?: string[];
  branchId: string | null;
  branchName: string | null;

  /** Paket Kapsamı: Salon Geneli ('gym') veya Personele / Antrenöre Özel ('trainer') */
  packageScope?: PackageScope;
  /** Personele özel ise antrenör / personel ID */
  trainerId?: string | null;
  /** Personele özel ise antrenör / personel adı */
  trainerName?: string | null;
  /** Personele ödenecek prim / komisyon yüzdesi (%) */
  trainerCommissionRate?: number | null;
  /** Çoklu eğitmen / antrenör fiyat matrisi */
  trainerPricing?: TrainerPackagePricing[];
}

import { BaseDocument } from '../../../shared/firestore/base-document';

export interface GymInfo extends BaseDocument {
  businessName: string;
  businessType: 'individual' | 'company';
  taxId: string | null;
  businessEmail: string;
  businessPhone: string;
  website: string | null;
  logo: string | null;
  trialDays: number;
  defaultPackageId: string | null;
  maxFreezeDays: number;
  cancellationPolicy: string | null;
  termsAndConditions: string | null;
  features: string[];
  city: string | null;
  address: string | null;
  openTime: string | null;
  closeTime: string | null;
  workingDays: number[];
}

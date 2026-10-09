import { BaseDocument } from '../../../../shared/firestore/base-document';

export interface Customer extends BaseDocument {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  address: string | null;
  note: string | null;
  discountRate: number;
  isArchive: boolean;
  branchId?: string | null;
  portalAccess?: boolean;
  portalStatus?: 'active' | 'invited' | 'disabled';
  portalUid?: string | null;
  lastMobileLoginAt?: string | null;
}

export interface CustomerPatientSummary {
  id: string;
  name: string;
  animalType: string;
}

export interface CustomerListItem extends Customer {
  patients: CustomerPatientSummary[];
}

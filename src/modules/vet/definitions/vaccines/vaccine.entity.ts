import { BaseDocument } from '../../../../shared/firestore/base-document';

export const VACCINE_RENEWALS = [
  'once',
  'days45',
  'weekly',
  'biweekly',
  'triweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'fourMonthly',
  'semiannual',
  'yearly',
  'biennial',
  'triennial',
] as const;
export type VaccineRenewal = (typeof VACCINE_RENEWALS)[number];

export interface VaccineMedicine {
  productId: string;
  quantity: number;
  salesAmount: number;
  taxId: string | null;
  remark: string | null;
}

export interface Vaccine extends BaseDocument {
  name: string;
  animalType: string | null;
  timeDone: number;
  renewal: VaccineRenewal;
  required: boolean;
  totalSaleAmount: number;
  medicines: VaccineMedicine[];
}

export interface VaccineMedicineListItem extends VaccineMedicine {
  productName: string;
  taxName: string;
}

export interface VaccineListItem extends Vaccine {
  medicines: VaccineMedicineListItem[];
}

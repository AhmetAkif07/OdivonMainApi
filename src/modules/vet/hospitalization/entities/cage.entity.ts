import { BaseDocument } from '../../../../shared/firestore/base-document';

export const CAGE_TYPES = ['cat', 'dog', 'icu', 'quarantine'] as const;
export type CageType = (typeof CAGE_TYPES)[number];

export const CAGE_STATUSES = ['available', 'occupied', 'cleaning', 'maintenance'] as const;
export type CageStatus = (typeof CAGE_STATUSES)[number];

export interface Cage extends BaseDocument {
  name: string;
  type: CageType;
  status: CageStatus;
  dailyRate: number;
  currentHospitalizationId?: string | null;
  currentPatientName?: string | null;
  notes?: string | null;
}

import { BaseDocument } from '../../../../shared/firestore/base-document';

export const HOSPITALIZATION_STATUSES = ['active', 'critical', 'recovering', 'discharged'] as const;
export type HospitalizationStatus = (typeof HOSPITALIZATION_STATUSES)[number];

export interface HospitalizationVitalLog {
  id: string;
  loggedAt: string;
  temp?: number | null;
  pulse?: number | null;
  respiratoryRate?: number | null;
  weight?: number | null;
  appetite?: 'good' | 'medium' | 'none' | null;
  defecation?: 'normal' | 'diarrhea' | 'none' | null;
  urination?: 'normal' | 'abnormal' | 'none' | null;
  notes?: string | null;
  staffName?: string | null;
}

export interface Hospitalization extends BaseDocument {
  customerId: string;
  patientId: string;
  cageId: string;
  cageName?: string;
  admittedAt: string;
  expectedDischargeAt?: string | null;
  actualDischargeAt?: string | null;
  reason: string;
  diagnosis?: string | null;
  doctorId?: string | null;
  doctorName?: string | null;
  dailyCost: number;
  treatmentNotes?: string | null;
  status: HospitalizationStatus;
  logs: HospitalizationVitalLog[];
  saleId?: string | null;
}

export interface HospitalizationListItem extends Hospitalization {
  customerName: string;
  patientName: string;
  patientAnimalType?: string;
  daysAdmitted: number;
  totalCost: number;
}

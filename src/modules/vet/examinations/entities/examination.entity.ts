import { BaseDocument } from '../../../../shared/firestore/base-document';

export const EXAMINATION_STATUSES = ['draft', 'completed'] as const;
export type ExaminationStatus = (typeof EXAMINATION_STATUSES)[number];

export interface ExaminationVitals {
  temp: number | null;
  pulse: number | null;
  respiratoryRate: number | null;
  weight: number | null;
}

export interface Examination extends BaseDocument {
  date: string;
  customerId: string;
  patientId: string;
  vitals: ExaminationVitals;
  symptoms: string[];
  complaint: string | null;
  treatment: string | null;
  diagnosis?: string | null;
  systemFindings?: Record<string, string> | null;
  treatmentItems?: Array<{ name: string; quantity: number; unit?: string; notes?: string; price?: number }> | null;
  appointmentId?: string | null;
  bundleId?: string | null;
  bundleName?: string | null;
  deductStock?: boolean;
  status: ExaminationStatus;
}

export interface ExaminationListItem extends Examination {
  customerName: string;
  patientName: string;
}

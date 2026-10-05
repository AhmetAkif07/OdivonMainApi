import { BaseDocument } from '../../../../shared/firestore/base-document';

export const CONSENT_TYPES = ['operation', 'hospitalization', 'euthanasia', 'general'] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ['signed', 'revoked', 'draft'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export interface ConsentForm extends BaseDocument {
  type: ConsentType;
  title: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerNationalId?: string | null;
  patientId: string;
  patientName: string;
  patientChipNumber?: string | null;
  procedureName?: string | null;
  riskAcknowledgment: boolean;
  anesthesiaApproval: boolean;
  emergencyInterventionApproval: boolean;
  doctorNotes?: string | null;
  signatureDataUrl: string;
  signedAt: string;
  status: ConsentStatus;
}

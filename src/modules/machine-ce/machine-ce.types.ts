import { MACHINE_CE_RECORD_KINDS } from './machine-ce.constants';

export type MachineCeRecordKind = (typeof MACHINE_CE_RECORD_KINDS)[number];
export type MachineCeRecordStatus =
  | 'draft'
  | 'in-review'
  | 'action-required'
  | 'approved'
  | 'rejected';

export interface MachineCeAttachmentMeta {
  id: string;
  name: string;
  category: string;
  mimeType: string;
  size: number;
  refCode: string;
  uploadedAt: string;
  uploadedBy: string;
}

export interface MachineCeAttachment extends MachineCeAttachmentMeta {
  recordId: string;
  tenantId: string;
  dataUrl: string;
}

export interface MachineCeRecord {
  id: string;
  tenantId: string;
  kind: MachineCeRecordKind;
  name: string;
  location: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  machineType: string | null;
  manufactureYear: number | null;
  directive: string | null;
  standardRefs: string[];
  hazard: string | null;
  severity: number | null;
  probability: number | null;
  riskScore: number | null;
  protectiveMeasures: string | null;
  residualRisk: string | null;
  responsibleName: string | null;
  assessmentDueAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  documentRefs: string[];
  attachments?: MachineCeAttachmentMeta[];
  status: MachineCeRecordStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

import { FIRE_SAFE_RECORD_KINDS } from './fire-safe.constants';

export type FireSafeRecordKind = (typeof FIRE_SAFE_RECORD_KINDS)[number];
export type FireSafeRecordStatus =
  'active' | 'pending' | 'completed' | 'action-required' | 'closed';

export interface FireSafeRecord {
  id: string;
  tenantId: string;
  name: string;
  kind: FireSafeRecordKind;
  location: string;
  facilityCode: string | null;
  inspectionDueAt: string | null;
  code: string | null;
  category: string | null;
  riskLevel: 'low' | 'medium' | 'high' | 'critical' | null;
  responsibleName: string | null;
  completedAt: string | null;
  result: 'pass' | 'conditional' | 'fail' | null;
  notes: string | null;
  documentRefs: string[];
  status: FireSafeRecordStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

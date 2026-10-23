export interface FireSafeRecord {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  facilityCode: string | null;
  inspectionDueAt: string | null;
  status: 'active' | 'pending';
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

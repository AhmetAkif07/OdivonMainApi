export interface FgasRecord {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  equipmentCode: string | null;
  refrigerant: string | null;
  status: 'active' | 'pending';
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

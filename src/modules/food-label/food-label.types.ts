export interface FoodLabelRecord {
  id: string;
  tenantId: string;
  name: string;
  location: string;
  sku: string | null;
  allergenSummary: string | null;
  status: 'active' | 'pending';
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

export type FoodLabelRecordKind =
  'product' | 'recipe' | 'allergen-review' | 'nutrition' | 'approval';
export type FoodLabelRecordStatus =
  'draft' | 'in-review' | 'action-required' | 'approved' | 'rejected';
export interface FoodLabelRecord {
  id: string;
  tenantId: string;
  kind: FoodLabelRecordKind;
  name: string;
  location: string;
  market: string | null;
  sku: string | null;
  brand: string | null;
  locale: string | null;
  netQuantity: string | null;
  ingredients: string | null;
  allergens: string[];
  claims: string[];
  energyKcal: number | null;
  proteinG: number | null;
  carbohydratesG: number | null;
  fatG: number | null;
  saltG: number | null;
  responsibleName: string | null;
  reviewDueAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  documentRefs: string[];
  status: FoodLabelRecordStatus;
  version: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  archivedAt: string | null;
  archivedBy: string | null;
}

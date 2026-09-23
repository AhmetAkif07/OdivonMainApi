import { BaseDocument } from '../../../../shared/firestore/base-document';

export const DEMAND_STATUSES = ['draft', 'ordered', 'completed', 'cancelled'] as const;
export type DemandStatus = (typeof DEMAND_STATUSES)[number];

export interface DemandLine {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface Demand extends BaseDocument {
  date: string;
  documentNo: string | null;
  supplierId: string | null;
  deliveryDate: string | null;
  note: string | null;
  status: DemandStatus;
  lines: DemandLine[];
}

export interface DemandListItem extends Demand {
  supplierName: string;
}
